# Disaster Recovery

How to rebuild this project's Supabase backend from scratch if the live
project (`linqsojbszglbgpoxgtv`) is lost. Written so someone doing this at
2am with no other context can follow it without guessing.

This assumes you already have: a Supabase account, this git repo, and the
Supabase CLI installed. It does **not** assume you have access to the old
project — where a step needs that access, it says so and gives the fallback.

## Restore order

Steps 1–3 restore the database schema. Steps 4–7 restore everything that
lives outside the database and can't be expressed in SQL. Do them in this
order — later steps depend on earlier ones existing.

### 1. Create the new Supabase project

Create it via the dashboard or `supabase projects create`. Note the new
project ref and database password — you'll need both below.

### 2. Apply migrations, oldest first

```
supabase link --project-ref <new-project-ref>
supabase db push
```

This runs every file in `supabase/migrations/` in filename order. The first
one that runs is `20260101000000_baseline_schema_snapshot.sql` — it creates
everything: extensions, enums, tables, constraints, indexes, functions,
triggers, RLS policies (including `storage.objects`), views, the 4 cron
jobs, and the 6 storage buckets. Every tracked migration after it
(`20260827...` onward) then replays on top, in order.

**Do not run the baseline file by itself and skip the rest** — the baseline
is a snapshot of live state as of 2026-09-24/25, not a full history. The
migrations after it contain real fixes (e.g. the account-deletion
`booking_calendar` view fix, the plan-guard consolidation) that the baseline
predates.

### 3. Verify the schema landed

```sql
select count(*) from information_schema.tables where table_schema = 'public';       -- expect 50
select count(*) from pg_policy;                                                     -- expect 177 (149 public + 28 storage.objects)
select count(*) from storage.buckets;                                               -- expect 6
select count(*) from cron.job;                                                      -- expect 4
```

If any of these come up short, stop and diagnose before moving on — steps 4+
assume a complete schema.

### 4. Set the `internal_secret` Vault value

Every trigger that calls an edge function (`send_email`, `sweep_account_deletions`,
`sweep_auto_approve_work_orders`, `trigger_job_matching`,
`trigger_send_launch_confirmation`, `trigger_send_push_notification`) reads
a secret from Vault and sends it as the `x-tradease-internal` header. The
matching edge functions check that header against their own `INTERNAL_SECRET`
env var (see `supabase/functions/_shared/internalSecret.ts`). **These two
values must be identical, or every internal function-to-function call fails
silently** (the SQL side catches the error and logs a notice — bookings and
emails will just quietly stop firing).

- If the old project still exists and you can reach it: copy the value over
  rather than regenerating —
  ```sql
  -- on the OLD project
  select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret';
  ```
- If the old project is gone: generate a fresh one. There's no reason it
  needs to match any previous value — it's only ever compared
  server-to-server, never seen by a client.
  ```
  openssl rand -hex 32
  ```

Either way, set it on the new project:

```sql
select vault.create_secret('<the value>', 'internal_secret');
```

Then set `INTERNAL_SECRET` to that same value on every edge function listed
in step 5 that needs it.

### 5. Set edge function secrets

Names only below — get the actual values from whatever secret manager or
password vault this team uses outside of Supabase (or generate new ones for
anything not shared with an external client). Set with:

```
supabase secrets set NAME=value --project-ref <new-project-ref>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
auto-provisioned by Supabase for every project — you don't need to set
those yourself. Everything below is custom and won't exist until you set it.

| Function | Custom env vars needed |
|---|---|
| `smart-endpoint` | none |
| `diag-stripe-mode` | none (410 stub, no external calls) |
| `send-push-notification` | `INTERNAL_SECRET` |
| `manage-employee` | *(none beyond the auto-provisioned ones)* |
| `send-email` | `RESEND_API_KEY`, `INTERNAL_SECRET` |
| `charge-customer` | `STRIPE_SECRET_KEY`, `INTERNAL_SECRET` |
| `match-job` | `ANTHROPIC_API_KEY` |
| `agent-job-match` | `ANTHROPIC_API_KEY` |
| `match-and-rank` | *(none beyond the auto-provisioned ones)* |
| `on-booking-created` | `ANTHROPIC_API_KEY`, `INTERNAL_SECRET` |
| `work-order-transition` | *(none beyond the auto-provisioned ones)* |
| `send-launch-confirmation` | `INTERNAL_SECRET` |
| `work-order-dispute` | *(none beyond the auto-provisioned ones)* |
| `process-account-deletions` | `INTERNAL_SECRET` |

Optional, only if adopting the new Supabase key-rotation system (see
`supabase/functions/_shared/secretKey.ts`): `SUPABASE_SECRET_KEYS`, a JSON
object like `{"default": "sb_secret_..."}`. Without it, every function falls
back to the auto-provisioned `SUPABASE_SERVICE_ROLE_KEY` — nothing breaks if
you skip this.

### 6. Deploy the edge functions

```
supabase functions deploy --project-ref <new-project-ref>
```

All 14 function sources are committed under `supabase/functions/` in this
repo (recovered from live where they'd drifted — see git log for
`chore(functions): recover source for two never-committed live functions`
and related commits). Deploy all of them, not a subset — several are called
by triggers created in step 2 and will 404 if missing.

### 7. Reconfigure Auth (dashboard — not scriptable)

None of this is expressible in SQL and isn't captured anywhere in this repo:

- **Email templates** (confirmation, magic link, password reset, invite) —
  Authentication → Email Templates.
- **OAuth providers**, if any are enabled, and their client ID/secret pairs.
- **Redirect URLs** / Site URL — must match the new project's actual app
  URLs, not the old project's.
- **JWT expiry and other auth settings** — Authentication → Settings.
- **Two-factor / phone auth provider config**, if used (the schema has
  `two_factor_method`/`two_factor_phone` columns on `users`, but the actual
  SMS provider credentials, if any, are Auth-side config, not a table).

### 8. Point the apps at the new project

Update `SUPABASE_URL` / anon key in both the mobile app and website app
config to the new project. Confirm the mobile app's `EXPO_PUBLIC_*` (or
equivalent) env and the website's `NEXT_PUBLIC_*` env both point at the new
project before shipping a build — a stale anon key here fails silently in
some client SDK versions rather than erroring loudly.

---

## What's still unrecoverable after all of this

Even with the baseline migration, the storage-bucket section, and this
document, three things cannot be reconstructed from anything in this repo:

1. **The actual secret values** — `internal_secret`, `STRIPE_SECRET_KEY`,
   `RESEND_API_KEY`, `ANTHROPIC_API_KEY`. This repo only ever records that
   they're needed and by what name. If nobody kept a copy of these outside
   Supabase (a password manager, the Stripe/Resend/Anthropic dashboards
   themselves) and the old project is gone, `STRIPE_SECRET_KEY` and
   `RESEND_API_KEY` in particular are **not** something you can regenerate
   without going back to Stripe/Resend and issuing new ones — which also
   means updating whatever else references the old ones.
2. **Auth configuration** — email template copy/branding, OAuth app
   credentials, JWT settings. This lives entirely in Supabase's Auth
   service config, has no SQL representation, and nothing in this repo
   records what the old values actually were beyond what step 7 lists as
   categories to redo.
3. **Anything from the ~145 untracked migrations this project accumulated
   between 2026-04-07 and the first tracked migration (2026-08-27) that
   *isn't* reflected in live state as of the baseline's snapshot date.** The
   baseline captures the end state of that history, not the history itself.
   If some intermediate schema decision was reverted before the snapshot was
   taken, it's gone — there was never a copy of it in this repo to begin
   with.

None of these are gaps this migration or this document can close by design
— they're either genuine secrets that must never live in a git repo, or
platform config with no SQL representation. The point of this document is
that the *shape* of what's missing is now known and enumerated, instead of
being rediscovered by trial and error during an actual outage.
