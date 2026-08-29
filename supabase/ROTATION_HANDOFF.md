# INTERNAL_SECRET rotation — handoff

Status as of 2026-08-29: **prep complete, value rotation not started.** Nothing is broken. Nothing needs urgent attention. This is where to pick back up.

## Current state

- **Code**: all 3 places that had the `x-tradease-internal` secret hardcoded as a literal now read it from env vars, with dual-accept so senders and receivers don't have to flip at the same instant. This is deployed and live.
- **Values**: `INTERNAL_SECRET` (current) and `INTERNAL_SECRET_NEXT` (rotation slot) are both set on the edge function platform, but **they currently hold the same value** — the original secret (ends `...b3d5f7`), not a new one. Same for Vault's `internal_secret` row. So the dual-accept plumbing is proven to work, but no actual rotation has happened yet. Flipping senders to "the new secret" right now would be a no-op, because there isn't one yet.
- Every sender→receiver pair authenticates correctly in this state (verified tonight with real status codes, not successful inserts).

## What's rotated vs what's not

| | Done |
|---|---|
| Hardcoded literal → `Deno.env.get('INTERNAL_SECRET')` | ✅ (`charge-customer`, `send-push-notification`, `send-launch-confirmation`) |
| Dual-accept (`isValidInternalSecret()` in `_shared/internalSecret.ts`) | ✅ deployed |
| A genuinely new secret value | ❌ not generated/set yet |
| Senders flipped to a new value | ❌ n/a — no new value exists yet |
| Dual-accept removed | ❌ intentionally left in — harmless, remove only after a real rotation completes |

## Exact steps to finish

1. **Generate a real new secret**, distinct from the current one (current ends `...b3d5f7` — the new one must not).
2. **Set `INTERNAL_SECRET_NEXT`** on the edge function platform via the **dashboard**, not the CLI — a CLI `secrets set` truncated a value by 3 characters earlier tonight (69 vs 72). Verify length is 72 in the secrets list before moving on.
3. **Update Vault**, from inside a SQL session (never pass the value through an assistant/tool call):
   ```sql
   SELECT vault.update_secret(
     (SELECT id FROM vault.secrets WHERE name = 'internal_secret'),
     '<the real new value>'
   );
   ```
4. **Verify Vault took a real value**, not a placeholder or a masked/redacted paste:
   ```sql
   SELECT length(decrypted_secret) AS len, right(decrypted_secret, 6) AS tail
   FROM vault.decrypted_secrets WHERE name = 'internal_secret';
   ```
   Expect `len = 72` and a tail that is **not** `b3d5f7` (that's the old value).
5. **Confirm `INTERNAL_SECRET_NEXT` ≠ `INTERNAL_SECRET`** — don't just trust two separate manual pastes matched. Easiest: temporarily re-add a masked diagnostic to `_shared/internalSecret.ts` (see "Diagnostic pattern" below), deploy one function, hit it once, read the masked shapes in the logs, remove the diagnostic again. Confirm the two shapes differ.
6. **Redeploy** `charge-customer`, `send-push-notification`, `send-launch-confirmation` (forces a fresh cold start so the new env values are actually read — they're read once per isolate, not per request).
7. **Retest all three pairs** with real status codes — see "Test methodology" below. All three should authenticate via the `INTERNAL_SECRET_NEXT` branch now.
8. **Flip the senders**: once verified, promote the new value into `INTERNAL_SECRET` itself (and drop `INTERNAL_SECRET_NEXT`, or leave both equal — either works, dual-accept degrades gracefully either way) on the edge function platform, and update Vault's `internal_secret` to match (it already holds the new value from step 3 — no further Vault change needed unless you want `INTERNAL_SECRET`/`INTERNAL_SECRET_NEXT` to converge on the platform side too).
9. **Redeploy again** after step 8, retest once more.
10. **Optional cleanup**: once satisfied nothing is still sending the old value, dual-accept can be removed from `_shared/internalSecret.ts` (drop `INTERNAL_SECRET_NEXT` and the second branch in `isValidInternalSecret()`). Not required — it's harmless to leave indefinitely.

## Pitfalls hit tonight (don't repeat these)

- **CLI truncation**: a `supabase secrets set` copy-paste came out 3 characters short (69 vs 72). Dashboard entry worked. Always verify length after setting, before testing.
- **Template placeholder pasted literally**: an example SQL snippet's `<paste the new value here>` placeholder got run as-is once, landing in Vault as literal placeholder text (length 26). Always sanity-check length immediately after any `vault.update_secret` call.
- **Masked/redacted value copied**: a partially-revealed dashboard display (`trd_int_XXXXXXXX...<real tail>`, with the middle masked) got copied instead of the fully-revealed value once — length came out 74, with literal `X` characters (ASCII 88) sitting where hex digits should be. Always click reveal/show fully before copying a secret out of a UI.
- **"New" value was actually the old one**: two independent pastes (Vault and `INTERNAL_SECRET_NEXT`) both ended up matching the *current* value, not a new one. Always confirm the new value's tail differs from the old before considering a rotation step done — don't rely on "I copied a fresh value" without checking.

## Diagnostic pattern (masked shape only, never the raw value)

If something doesn't match again, this is the safe way to compare without ever printing a secret:

```ts
function mask(s: string | null | undefined): string {
  if (s === undefined) return '(unset)';
  if (s === null) return '(null)';
  if (s.length === 0) return '(empty)';
  return `len=${s.length} starts="${s.slice(0, 8)}" ends="${s.slice(-6)}"`;
}
console.log(JSON.stringify({ level: 'info', msg: 'internalSecret env diagnostic',
  INTERNAL_SECRET: mask(INTERNAL_SECRET), INTERNAL_SECRET_NEXT: mask(INTERNAL_SECRET_NEXT) }));
```

Add temporarily to `_shared/internalSecret.ts`, deploy, trigger one request, read the masked log line, remove and redeploy clean again. Same pattern works on the Vault side via `length()`/`right()`/`ascii()` in plain SQL — no extension needed.

## Test methodology (real status codes, not successful inserts)

- **`charge-customer`** (real sender: `sweep_auto_approve_work_orders`, but it only fires its `net.http_post` call when a real work order matches `status = 'completed' AND auto_approve_at <= NOW()` — usually none exist, so this is normally a replica, not a live cron-triggered call):
  ```sql
  SELECT net.http_post(
    url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/charge-customer',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-tradease-internal', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_secret')),
    body := jsonb_build_object('work_order_id', '00000000-0000-0000-0000-000000000000')
  );
  ```
  Real success = `404 "Work order not found"`. A `401` means auth failed.

- **`send-push-notification`** (no real automated sender currently sends this function the correct header at all — pre-existing, separate gap, unrelated to this rotation — so this is always a synthetic probe, not a real production path):
  ```sql
  SELECT net.http_post(
    url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-tradease-internal', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_secret')),
    body := jsonb_build_object('notification_id', '00000000-0000-0000-0000-000000000000')
  );
  ```
  Real success = `404 "notification not found"`.

- **`send-launch-confirmation`** (genuine end-to-end: real trigger, real Postgres function, real Vault read, real HTTP call):
  ```sql
  INSERT INTO public.launch_signups (id, email, name, role, zip, source)
  VALUES (gen_random_uuid(), 'rotation-test@example.invalid', 'Rotation Test', 'customer', '00000', 'internal_test_disposable')
  RETURNING id;
  -- wait ~10s, check net._http_response for the matching request, then:
  DELETE FROM public.launch_signups WHERE id = '<the id just returned>';
  ```
  Real success = `502` with body mentioning `"the send.tradease.tech domain is not verified"` (a pre-existing, unrelated Resend config gap — this means auth succeeded and the code ran all the way to the email send). A `401` means auth failed.

After every `net.http_post` call above, check the real result:
```sql
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 5;
```

## Where things live

- Dual-accept helper: `supabase/functions/_shared/internalSecret.ts`
- Receivers: `supabase/functions/{charge-customer,send-push-notification,send-launch-confirmation}/index.ts`
- Senders (Postgres, already Vault-based, no code change needed for rotation): `sweep_auto_approve_work_orders()`, `send_email(p_template, p_to, p_data)`, `trigger_send_launch_confirmation()`
- Vault secret name: `internal_secret`
- Edge function env vars: `INTERNAL_SECRET`, `INTERNAL_SECRET_NEXT`
