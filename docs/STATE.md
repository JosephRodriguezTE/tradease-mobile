# Project State Audit — 2026-08-30 (re-run)

Independent, read-only re-verification of the same completion list, re-run fresh per instruction rather than trusting the previous pass. Nothing was changed, fixed, or committed except this file. Where a finding is unchanged from the last audit, it's re-confirmed live, not carried over from memory — see each item for what was actually re-run this time.

## What's actually true right now

Everything verified in the previous audit still holds — the underlying code and deployed functions haven't moved. **But the audit process itself produced two new findings this pass, both examples of exactly the failure mode this exercise exists to catch.** First: the previous audit's own two commits (`e789172`, `f32b816`) were committed but never pushed — "ahead 2" on origin/master, sitting locally only. Second: a 13th edge function, `diag-stripe-mode`, now exists on the project — a temporary diagnostic deployed during a follow-up investigation, which I have no tool access to delete, so it's still live. Both are disclosed fully in Section A and D4 below. Beyond those two, the state is exactly as previously reported: the key/secret migration work is real and correct, the map privacy model is verified live, and the same two production-affecting bugs remain (the auto-approve-and-pay flow is broken end to end, and push notifications are silently failing project-wide).

---

## A. Git state

**tradease3 (mobile app repo)**
```
git status -sb → ## master...origin/master [ahead 2]
git log origin/master..HEAD --oneline →
  f32b816 docs: payment flow audit — work order completion through payout
  e789172 docs: audit current state against reported-complete work list
```
**FAILED — unpushed commits found.** These are my own two audit-documentation commits from the prior session, sitting local-only. Not a code risk, but a direct, live example of the exact "committed but not pushed" failure mode this audit was asked to check for. Every other commit is on origin.

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
| This audit's own docs | `e789172`, `f32b816` | ❌ committed, not pushed |

**Still unresolved from last time**: the charge-customer ownership check has no dedicated commit — `git log --all -- supabase/functions/charge-customer/` still shows only `a3170e9` (the unrelated sb_secret_ batch, which is the first time this file entered git) and `a8126f6` (INTERNAL_SECRET work). The code itself is present and correct in the deployed source (re-confirmed fresh this pass, see C3) — this is a process/attribution gap, not a functional one.

**Website repo**
```
git status -sb → ## main...origin/main   (clean, 0 ahead, 0 behind)
git log origin/main..HEAD --oneline → (empty)
```
**VERIFIED** — clean, fully pushed. `1b533e0` (email-notifications.ts → getServiceKey()) and `faa1321` (sb_secret_ migration) both present, both on origin.

---

## B. Map feature

**B1 — VERIFIED (re-confirmed via fresh grep).** `app/(tabs)/map.tsx` line 410 calls `supabase.rpc('public_jobs_nearby', {...})`. No `customer:customer_id` join anywhere in the file.

**B2 — VERIFIED via signature, same caveat as before.** `public_jobs_nearby()`'s `RETURNS TABLE(...)` is fixed: `id, trade, urgency, status, price_estimate, created_at, request_expires_at, fuzzed_lat, fuzzed_lng, town, nearest_major_road`. No exact coordinate, no address, no customer identity. **Still cannot verify against live rows** — `bookings` still has zero rows matching the function's own filter (re-checked this pass, still empty). No test data inserted (read-only).

**B3 — VERIFIED, real output, re-run fresh.**
```
call_1: fuzzed_lat=37.7751192290043, fuzzed_lng=-122.416470261496
call_2: fuzzed_lat=37.7751192290043, fuzzed_lng=-122.416470261496
```
Byte-identical, via direct `fuzz_point()` calls (same substitute method as last time, since `public_jobs_nearby()` still has no data to exercise it end to end).

**B4 — VERIFIED (re-confirmed via fresh grep).** Job pins use `jobTrade(j.trade).color` from `lib/map/trades` (`fromDbValue`/`getTrade`), not hardcoded orange.

**B5 — still exists.** `app/(tabs)/map.new.tsx` confirmed present again this pass. Reporting only, not deleted.

---

## C. Payment auth

**C1 — VERIFIED, real error, re-run fresh.**
```sql
SET ROLE authenticated;
SELECT public.mark_work_order_paid('00000000-0000-0000-0000-000000000000'::uuid, 'pi_test');
→ ERROR: 42501: permission denied for function mark_work_order_paid
```

**C2 — VERIFIED, re-run fresh.** Only single-arg signatures exist: `save_payment_method(p_payment_method_id text)`, `upsert_stripe_customer(p_stripe_customer_id text)`. No `p_user_id` overload.

**C3 — VERIFIED, fetched fresh (not cached).** `charge-customer` v19, unchanged since last audit. Ownership check present, correctly placed before both `stripePost()` call sites:
```ts
if (!isInternal && callerId !== wo.customer_id) {
  return json({ error: 'Forbidden' }, 403);
}
```

---

## D. Credentials

**D1 — VERIFIED, zero hits, re-run fresh.** Project-wide search of every function's `prosrc` and every trigger definition, as `authenticated`, for a JWT-shaped string or `trd_int_`: 0 hits both.

**D2 — Vault secrets (name / length / last 6 — re-confirmed identical to last audit):**
| name | length | last 6 |
|---|---|---|
| `anon_key` | 208 | `fnGirU` |
| `internal_secret` | 72 | `b3d5f7` |
| `service_role_key` | 219 | `89xXmg` |
| `service_role_key_v2` | 41 | `AuJFwn` |

**D3 — VERIFIED, CRITICAL, re-run fresh: legacy key still active.**
```
GET /rest/v1/users?select=id&limit=1  (apikey: legacy service_role_key, sourced from Vault, never printed)
→ 200 {"id":"91fd1927-f2a4-470b-9ea9-04ceef752a42"}
```
Unchanged from last audit — still not deactivated.

**D4 — one real change since last audit: 13 deployed functions now, not 12.** `diag-stripe-mode` was deployed in a follow-up session to answer a Stripe-key question with a single read-only call, and I have no delete-function tool available to remove it — it is still live on the project. **Confirm-and-delete this yourself**: Supabase Dashboard → Edge Functions → `diag-stripe-mode` → Delete. It reads `STRIPE_SECRET_KEY` and calls `api.stripe.com/v1/balance` (read-only, cannot charge anything) — no `getServiceKey()` involvement, not part of this migration, but it's new attack surface sitting on the project that shouldn't stay.

Of the 12 real functions: `charge-customer` and `send-email` were fetched fresh this pass (both confirmed on `getServiceKey()`, versions unchanged at v19/v16). The other 10 (`send-push-notification` v20, `manage-employee` v14, `match-job` v15, `agent-job-match` v11, `match-and-rank` v11, `on-booking-created` v10, `work-order-transition` v11, `send-launch-confirmation` v16, `work-order-dispute` v8, `smart-endpoint` v14) show identical version numbers to the last full-source fetch this session — since nothing has redeployed them, I'm treating that as sufficient rather than re-pulling byte-identical bodies. `smart-endpoint` remains the one function with no Supabase client or key usage at all (correct, not a gap).

---

## E. Known-broken, confirm still broken

**E1 — VERIFIED still broken.** `send-email` (fetched fresh, v16, unchanged): `if (!authHeader || authHeader !== \`Bearer ${SERVICE_ROLE_KEY}\`)`. No `x-tradease-internal` check anywhere.

**E2 — VERIFIED still broken.** `lib/push.ts` (website, read fresh): still `Authorization: Bearer ${SERVICE_ROLE_KEY}` to `send-push-notification`, which only checks `x-tradease-internal`.

**E3 — VERIFIED still true.** All 13 deployed functions checked (the 12 real ones plus the new diagnostic) — nothing named or shaped like a Stripe webhook handler.

**E4 — still resolved, re-confirmed.** `app/work-order/contractor.tsx` line 596, `JOB ADDRESS` label, re-confirmed present via fresh grep. The previously-reported "RLS allows it, nothing reads it" gap remains closed.

**E5 — VERIFIED still broken, re-run fresh.** `enum_range(NULL::public.work_order_status)` unchanged: `'approved'` is still not a member. `charge-customer` (v19, unchanged) still has `if (!['approved', 'completed'].includes(wo.status))`.

*(Note: a much deeper investigation of this specific bug happened between the last audit and this one — see `docs/PAYMENT_FLOW_STATE.md`, committed but not yet pushed per Section A. It found the actual root cause is a dual-column `status`/`wo_status` split with an unenforced transition guard, at least four competing/dead implementations of "approve and pay" across both repos, and a Stripe key that is separately invalid regardless of test/live mode. That work is a superset of this single line item — read that file for the full picture before acting on E5 in isolation.)*

**E6 — VERIFIED still present, re-run fresh.** Real row: `id: 1442f0ec-1b01-4dbb-99e8-1f37e1f6b357, trade_type: "HVAC, Electrical"`.

---

## F. Environment

**F1 — Vercel `SUPABASE_SECRET_KEY` — CANNOT CHECK, outside my reach.** Vercel dashboard → website project → Settings → Environment Variables → search `SUPABASE_SECRET_KEY` → confirm present and note which of Production/Preview/Development it's scoped to.

**F2 — Supabase edge function secrets — VERIFIED, checked live.** Unchanged list from last audit: `ANTHROPIC_API_KEY, INTERNAL_SECRET, INTERNAL_SECRET_NEXT, RESEND_API_KEY, STRIPE_PRICE_LEADS, STRIPE_PRICE_PRO, STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL`, plus one Google OAuth client ID. (Also now known, from the follow-up session: `STRIPE_SECRET_KEY` is a `sk_live_...` key that Stripe itself currently rejects with a 401 "Invalid API Key provided" — confirmed via a real, read-only API call. Separate from this migration's scope, but directly relevant if anyone touches payment code.)

**F3 — legacy service_role key — VERIFIED, checked live.** Active. See D3.

---

## Three things I'd fix first

Updated from the last audit given what's been learned since — the underlying priorities haven't changed, but #1 now has a fuller picture available.

1. **The auto-approve-and-pay flow is broken end to end.** Confirmed again this pass at the enum level (E5), and a full follow-up investigation (`docs/PAYMENT_FLOW_STATE.md`) traced the complete root cause: a `status`/`wo_status` dual-column split that silently bypasses the one real transition guard, at least four separate live-or-dead implementations of "approve and pay" across both repos, none of which calls Stripe for real (two explicitly comment their payment step as "(mock)"), and — newly discovered — the Stripe key itself is currently invalid regardless of any of that. Fix the key first; nothing else can be validated without it.
2. **Deactivate the legacy key.** Still fully active, still nothing blocking it (D1 zero hits, D4 confirms all real functions prefer the new key). Pure remaining exposure.
3. **Push this repo, then build a Stripe webhook receiver.** The immediate, zero-risk action is pushing the two local-only commits — a one-command fix for a real gap this same audit just found. The webhook receiver remains the right next structural fix: no reconciliation path exists for async payment outcomes, which compounds risk with #1 once real money is involved.
