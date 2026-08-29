# Project State Audit — 2026-08-30

Independent, read-only verification of a prior completion list. Nothing was trusted without a real command/query and real output. Nothing was changed, fixed, or committed except this file.

## What's actually true right now

The service-key and internal-secret migration work is real, deployed, and committed — every claim about it checked out. **The legacy `service_role` key is still fully active** with nothing left blocking deactivation (zero hardcoded copies found anywhere, all 11 real edge functions confirmed preferring the new key). The map privacy model (fuzzed coordinates, RPC-only read path, trade colors) is real and verified live. Two real, current bugs will affect money and notifications in production: `charge-customer`'s status allowlist references a work-order status (`'approved'`) that **does not exist** in the enum, which breaks the entire 72-hour auto-approve-and-pay flow; and push notifications are silently failing project-wide because the sender and receiver disagree on which header carries the credential. One item on the "known-broken, don't touch" list has been silently resolved: a contractor now has a real, working path to see a job's true street address after their claim is accepted — the RLS-allows-it/nothing-reads-it gap is closed. One process gap: the `charge-customer` ownership check exists correctly in the deployed code but was never given its own commit.

---

## A. Git state

**tradease3 (mobile app repo)**
```
git status -sb → ## master...origin/master   (clean, 0 ahead, 0 behind)
git log origin/master..HEAD --oneline → (empty — nothing unpushed)
```
**VERIFIED** — clean tree, fully pushed.

| Claimed work | Commit | On origin |
|---|---|---|
| Map library work | `ccae20f` + related map commits | ✅ |
| Schema reconciliation | `e2fa00c` | ✅ |
| RPC switch | `6485428` | ✅ |
| Trade colors | `8dce6c3` | ✅ |
| Payment fixes (mark_work_order_paid) | `7085f2b` | ✅ |
| Payment fixes (save_payment_method/upsert_stripe_customer) | `780c4b5` | ✅ |
| Payment fix (charge-customer ownership check) | **none found** | ⚠️ see below |
| Vault migration | `0deb723` | ✅ |
| Key migration (pilot + batch + send-launch-confirmation + trigger_job_matching) | `8bb8b0b`, `a3170e9`, `598d4cf`, `a650157` | ✅ |
| INTERNAL_SECRET prep | `a8126f6` | ✅ |
| Handoff note | `706c6e0` | ✅ |

**FAILED (process, not code)**: the charge-customer ownership check has no dedicated commit. `git log --all -- supabase/functions/charge-customer/` shows only two commits ever touched this file: `a3170e9` (the unrelated sb_secret_ batch migration, which is the first time this file entered git at all) and `a8126f6` (INTERNAL_SECRET work). It was applied live to production directly (no staging environment) and only entered git bundled into a later, unrelated commit when the file was first added. **The code itself is present and correct** — verified independently in section C3.

**Website repo**
```
git status -sb → ## main...origin/main   (clean, 0 ahead, 0 behind)
git log origin/main..HEAD --oneline → (empty)
```
**VERIFIED** — `1b533e0` (email-notifications.ts → getServiceKey()) and `faa1321` (sb_secret_ migration) both present, both on origin.

---

## B. Map feature

**B1 — public_jobs_nearby(), no customer join — VERIFIED.** `app/(tabs)/map.tsx` line 410 calls `supabase.rpc('public_jobs_nearby', {...})` for the contractor path. No `customer:customer_id` join anywhere in the file.

**B2 — column list, no PII — VERIFIED, but via signature not live rows.** `public_jobs_nearby()`'s `RETURNS TABLE(...)` is a compile-time-fixed contract: `id, trade, urgency, status, price_estimate, created_at, request_expires_at, fuzzed_lat, fuzzed_lng, town, nearest_major_road`. No exact coordinate, no address, no customer identity — structurally impossible for it to return any of those regardless of data. **Could not additionally verify against real returned rows**: the `bookings` table currently has zero rows matching the function's own filter (`status='pending' AND contractor_id IS NULL AND is_public=true AND job_lat/lng IS NOT NULL`) — confirmed by querying that exact condition directly, zero rows. Not a query problem; there is genuinely no live test data. Did not insert any (read-only constraint).

**B3 — deterministic fuzzing — VERIFIED, real output.** Since no live data exists to run `public_jobs_nearby()` end-to-end, called `fuzz_point()` directly — the same function it uses internally — twice with identical synthetic arguments:
```
call_1: fuzzed_lat=37.7751192290043, fuzzed_lng=-122.416470261496
call_2: fuzzed_lat=37.7751192290043, fuzzed_lng=-122.416470261496
```
Byte-identical. The function is `IMMUTABLE`, driven purely by `md5(job_id || ':lat'/':lng')` — no `random()`, no volatile state — so this is architecturally guaranteed, not coincidence.

**B4 — trade colors, not hardcoded orange — VERIFIED.** `JobCard`'s badge and the map's job pins both use `jobTrade(item.trade).color` / `jobTrade(j.trade).color`, resolved via `fromDbValue`/`getTrade` from `lib/map/trades`. (Contractor-availability pins and the user's own-location pin use unrelated status colors — green/gray/blue — correctly unrelated to trade.)

**B5 — map.new.tsx — still exists.** Confirmed present at `app/(tabs)/map.new.tsx`. Reporting only, per instructions — not deleted.

---

## C. Payment auth

**C1 — mark_work_order_paid, service_role only — VERIFIED, real error.**
```sql
SET ROLE authenticated;
SELECT public.mark_work_order_paid('00000000-0000-0000-0000-000000000000'::uuid, 'pi_test');
→ ERROR: 42501: permission denied for function mark_work_order_paid
```

**C2 — old two-arg signatures gone — VERIFIED.**
```
save_payment_method(p_payment_method_id text)
upsert_stripe_customer(p_stripe_customer_id text)
```
Only single-arg versions exist for either name — no `p_user_id` overload remains.

**C3 — charge-customer ownership check — VERIFIED, present and correctly placed.** Fetched the deployed source fresh (v19). The check:
```ts
if (!isInternal && callerId !== wo.customer_id) {
  return json({ error: 'Forbidden' }, 403);
}
```
sits immediately after the work-order lookup and before every subsequent branch, including both `stripePost()` calls (idempotent-capture and create-new-PaymentIntent). No `api.stripe.com` call can be reached by a non-owning, non-internal caller.

---

## D. Credentials

**D1 — no JWTs or trd_int_ anywhere, as authenticated — VERIFIED, zero hits.**
```sql
SET ROLE authenticated;
-- search every function's prosrc, every trigger's definition, project-wide
→ 0 hits (functions), 0 hits (triggers)
RESET ROLE;
```

**D2 — Vault secrets (name / length / last 6 chars only):**
| name | length | last 6 |
|---|---|---|
| `anon_key` | 208 | `fnGirU` |
| `internal_secret` | 72 | `b3d5f7` |
| `service_role_key` | 219 | `89xXmg` |
| `service_role_key_v2` | 41 | `AuJFwn` |

**D3 — legacy service_role key active status — VERIFIED, CRITICAL: still active.** Real HTTP call using the legacy key (sourced from Vault via SQL subquery, never printed) against the REST API:
```
GET /rest/v1/users?select=id&limit=1  (apikey: legacy service_role_key)
→ 200 {"id":"91fd1927-f2a4-470b-9ea9-04ceef752a42"}
```
Not deactivated. Real data returned. This matches the handoff note's own status — the user explicitly stopped before deactivating.

**D4 — all edge functions read via getServiceKey() — VERIFIED for 11 of 12, correctly N/A for the 12th.** Fetched all 12 deployed functions' source fresh (not from local files, not from memory): `work-order-dispute`, `manage-employee`, `send-email`, `match-job`, `agent-job-match`, `match-and-rank`, `on-booking-created`, `work-order-transition`, `send-push-notification`, `send-launch-confirmation`, `charge-customer` all import and call `getServiceKey()` from `_shared/secretKey.ts`. `smart-endpoint` (the 12th) has no Supabase client and no key usage of any kind — confirmed correct, not a gap (it's a literal hello-world stub, unchanged).

Live spot-check (not all 12 re-invoked in this audit — see caveat below): probed `charge-customer` directly, fresh log line:
```
2026-08-29T20:18:27.799 {"level":"info","msg":"resolved service key","key_source":"sb_secret"}
```
**CANNOT FULLY VERIFY live for the other 10** — did not invoke all of them in this audit pass; their correctness is established from fresh source inspection (D4 above) plus a live confirmation from a prior session, not re-proven live today. Flagging this distinction rather than implying full live re-verification.

---

## E. Known-broken, confirm still broken

**E1 — send-email / x-tradease-internal mismatch — VERIFIED still broken.** Deployed source, fetched fresh: `if (!authHeader || authHeader !== \`Bearer ${SERVICE_ROLE_KEY}\`)`. No `x-tradease-internal` check exists anywhere in this file. Every caller that sends `x-tradease-internal` (charge-customer, the Postgres `send_email()` function, `sweep_auto_approve_work_orders`) is talking to a receiver that ignores that header entirely.

**E2 — website lib/push.ts wrong credential — VERIFIED still broken.** Current file, read fresh:
```ts
Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
```
sent to `send-push-notification`, which (confirmed in D4/E-context above) only checks `x-tradease-internal`. Note: this file's *key resolution* was migrated to `getServiceKey()` in a separate task — that migration was real and correct — but the underlying wrong-header bug was deliberately left alone, exactly as previously reported.

**E3 — no Stripe webhook receiver — VERIFIED still true.** The full, fresh-fetched list of all 12 deployed edge functions contains nothing named or shaped like a Stripe webhook handler. Nothing consumes `payment_intent.succeeded`, failures, or disputes.

**E4 — contractor real-address path — FAILED. This one changed; flagging prominently.** The claim was "RLS allows it; nothing reads it." That's no longer true. `app/work-order/contractor.tsx`'s `CustomerSection` component (rendered on the contractor's work-order screen, which only exists after a claim is accepted) does:
```tsx
const address = wo.job_address || wo.booking?.job_address || null;
...
{address && (
  <View style={...}>
    <Text style={s.addressLabel}>JOB ADDRESS</Text>
    <Text style={s.addressTxt}>{address}</Text>
    <TouchableOpacity onPress={() => navigateTo(jobLat, jobLng, address)}>...Navigate...
```
A real, labeled, visible address card with a working Navigate button, gated on nothing but the work order existing. This resolves the previously-reported gap — whether that was intentional or a side effect of other work-order feature development, the described state ("nothing reads it") is no longer accurate.

**E5 — invalid 'approved' status in charge-customer's allowlist — VERIFIED still broken, and worse than a typo.** Queried the real enum:
```sql
SELECT enum_range(NULL::public.work_order_status);
→ {submitted,accepted,deposit_secured,en_route,arrived,in_progress,waiting_for_customer,
   materials_needed,change_order_pending,awaiting_approval,payment_releasing,completed,
   cancelled,disputed}
```
`'approved'` is not in this list. `charge-customer`'s deployed source still has:
```ts
if (!['approved', 'completed'].includes(wo.status)) { ... }
```
This connects directly to the previously-known `sweep_auto_approve_work_orders` bug (`UPDATE work_orders SET status = 'approved'`) — that write would itself fail against the enum, meaning **the entire 72-hour auto-approve-and-pay flow is currently broken end-to-end**, not just an unreachable code branch. See "three things to fix first" below.

**E6 — multi-value trade_type — VERIFIED still present.** Real row:
```
id: 1442f0ec-1b01-4dbb-99e8-1f37e1f6b357, trade_type: "HVAC, Electrical"
```

---

## F. Environment

Two of these three turned out to be checkable from here — I checked them rather than deferring.

**F1 — Vercel `SUPABASE_SECRET_KEY` — CANNOT CHECK, genuinely outside my reach.** Exact path: Vercel dashboard → the website project → **Settings → Environment Variables** → search `SUPABASE_SECRET_KEY`. Confirm it's present and note which of Production / Preview / Development it's scoped to — the earlier work only confirmed the user had added it, not which environments.

**F2 — Supabase edge function secrets, which exist right now — VERIFIED, checked live** (`supabase secrets list`, names and update timestamps only, values are opaque hashes from the CLI itself):
```
ANTHROPIC_API_KEY, INTERNAL_SECRET, INTERNAL_SECRET_NEXT, RESEND_API_KEY,
STRIPE_PRICE_LEADS, STRIPE_PRICE_PRO, STRIPE_SECRET_KEY, SUPABASE_ANON_KEY,
SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, plus one Google OAuth client ID
```
Notable: `INTERNAL_SECRET` and `INTERNAL_SECRET_NEXT` show the **same** value-hash (`d9112f54...374d`) — corroborates the handoff note: the rotation genuinely never happened, both slots still hold the current secret.

**F3 — legacy service_role key active or deactivated — VERIFIED, checked live.** See D3 above: **active**. Real 200 response with real data.

---

## Three things I'd fix first

1. **The 72-hour auto-approve-and-pay flow is broken end-to-end (E5).** `sweep_auto_approve_work_orders` writes a `work_order_status` of `'approved'`, which isn't a valid enum value — that write fails — so a contractor whose customer never manually approves has no way to get paid automatically. This is a real, current, money-affecting bug, not a stale finding. Fix the enum mismatch (either add a real `approved` status or change the sweep to use a value that already exists, e.g. `completed` + a separate approval flag) and fix `charge-customer`'s allowlist to match.

2. **Deactivate the legacy `service_role` key.** Every blocking condition from the original migration is now satisfied: zero hardcoded copies anywhere (D1), all real edge functions prefer the new key (D4), and D3 just proved the legacy key is still live and fully functional right now — meaning if it was ever exposed via the `pg_proc.prosrc` world-readability issue found earlier (before the Vault migration closed that hole), it's still usable by whoever has it. This is pure remaining exposure with no offsetting benefit. Not a code fix, but the highest-leverage action available.

3. **Build a Stripe webhook receiver (E3).** There is currently no way for the app to learn about a `payment_intent.succeeded` that happens asynchronously, a failed charge after the fact, or a dispute opened directly on Stripe's side. Combined with the auto-approve bug above, payment state can silently drift from what actually happened in Stripe with nothing to reconcile it.

*(Close fourth: E1+E2, the push/email credential mismatches — real product functionality quietly not working today — but the three above have more direct money/security impact.)*
