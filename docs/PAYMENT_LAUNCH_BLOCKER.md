# LAUNCH BLOCKER — no path currently moves real money

**This is not a cleanup note. Do not schedule this as tech debt.** Until this is
resolved, completing a real job in production does not pay the contractor,
regardless of which app the customer approves from.

> **Read these two first.**
>
> 1. **Until Stripe is live, no work order with a payment attached can
>    complete — on either platform.** Website work orders get a $0
>    `pending_hold` intent at creation; mobile work orders get a mock `held`
>    intent when the deposit is secured. Neither can ever be `captured`
>    (clients can't write capture, and nothing server-side captures yet), so
>    approval stops at `payment_releasing`. That's correct — nothing was
>    charged — but it means **the full job lifecycle cannot be demonstrated
>    end to end until Stripe lands.** Only work orders that never had a
>    payment attached complete today. Don't "fix" it by relaxing the gate.
> 2. **`payments_live()` flip ordering: mobile's `securePayment()` must already
>    be on the real Stripe hold *before* the gate flips to `true`.** The flip
>    also stops clients creating intents, which is how today's mock hold
>    works — flip first and securing a deposit breaks the moment it's
>    switched. Order: ship the real hold (server-created intents) → verify →
>    flip the gate in the same release that makes capture live.

Written 2026-09-16, from code in both repos. Read alongside
`docs/PAYMENT_FLOW_STATE.md` (2026-08-30, verified live against `pg_catalog`
and `cron.job_run_details` — the deeper, DB-confirmed source for the
`status`/`wo_status` dual-column mechanics). This document adds one path that
one didn't cover, and the `payment_intents`/`stripe_payment_intent_id`
column split, then restates the finding in the terms it was asked for.

## The four facts

**1. `charge-customer` is the only code in either repo that talks to real Stripe.**
It calls `api.stripe.com` directly (`stripePost()`, using `STRIPE_SECRET_KEY`)
to create an off-session `PaymentIntent` against the customer's saved card
and transfer to the contractor's Connect account. Grepped both repos for
every Stripe reference and every `payment_intents`/`payment_events` write
site (this session, see chat) — nothing else reaches Stripe. Per
`PAYMENT_FLOW_STATE.md` section 3, its only caller, `sweep_auto_approve_work_orders`,
cannot function (queries a `status` value nothing ever reaches). So this is
not just under-used — as of today, it is **unreachable from any live
trigger, cron job, or button in either app.**

**2. Three independent places mark a job "paid," and only one of them is real:**

| Path | Where | What it actually does |
|---|---|---|
| Mobile app | `app/work-order/customer.tsx`, `handleApprove()` | Submits the review, then `supabase.from('payment_intents').update({ status: 'captured', ... })` directly, then transitions `work_orders.wo_status` to `'completed'` via the `work-order-transition` edge function. |
| Website | `app/dashboard/customer/jobs/[id]/work-order/actions.ts`, `approveWorkOrder()` | Same shape: `payment_intents` → `'captured'` by direct update, then `work_orders.status` → `payment_releasing` → `completed`. (Documented in depth in `PAYMENT_FLOW_STATE.md` §3 as "Path C.") |
| `charge-customer` | edge function | The one that's real — see fact 1. Unreachable today. |

The mobile path is not in `PAYMENT_FLOW_STATE.md` — that audit covered the
website's two approve buttons only. It's the same failure shape as the
website's, independently implemented, in a different repo, in a different
language-adjacent codebase, by (presumably) a different point in time. Two
teams' worth of engineers can independently arrive at "just update the
status column" when the real capture path isn't wired to anything visible.

**3. The first two mark payment captured without moving any money.**
Both are a bare `UPDATE payment_intents SET status = 'captured'` — a
database write with no Stripe API call anywhere near it. There's no webhook
receiver in the project to catch or reconcile this afterward (confirmed in
`PAYMENT_FLOW_STATE.md` §3). A job can reach `completed` in either app,
customer-facing, with a green "Payment Protected" checkmark, and the
contractor is never paid.

**4. `work_orders.stripe_payment_intent_id` and `work_orders.payment_intent_id` are different columns, feeding different systems that don't know about each other.**
- `payment_intent_id` points into the `payment_intents` table — a
  self-contained mock ledger (its own `status` enum: `pending_hold` → `held`
  → `captured`/`released`/`refunded`, its own `payment_events` audit log).
  There's even a fully-built `PaymentProvider` abstraction for it
  (`lib/payment/provider.ts` + `lib/payment/mock.ts`, `MockPaymentProvider`,
  correctly tagging every row `provider:'mock'` and logging every event) —
  **and nothing in either repo called it until this session** (fixed for
  the deposit-hold step only, this session — see `af1e37c`; the two capture
  paths in the table above still bypass it).
- `stripe_payment_intent_id` is a plain string holding Stripe's own real ID,
  read and written only by `charge-customer` and `mark_work_order_paid`.

These never reconcile. A work order can have a `payment_intent_id` pointing
at a fully "captured" mock row and a null `stripe_payment_intent_id`,
looking completely paid to both apps' UI while zero dollars have moved.

## What has to happen before launch

One of the three paths in fact 2 has to become the single source of truth
for capture. The other two need to be deleted, not left in place as
"legacy" — their current behavior (silently faking success) is worse than
an error would be. This document doesn't recommend which one wins; that's
a product decision (does capture happen from the mobile app, the website,
or only server-side via the cron once fact 1's cron-query bug is also
fixed?), not an engineering one. Whichever it is, the other two call sites
should be removed in the same change, not scheduled separately — a second
fake-capture path left running is exactly how this gap was invisible for
this long.

## Update — 2026-09-23: fake capture removed, charge-customer repaired, website hold deliberately deferred

Half of the above is now done: **the fake-capture write is gone from both
app paths.** Neither `handleApprove()` (mobile) nor `approveWorkOrder()`
(website) touches `payment_intents` anymore — the product decision of
*which* path becomes the real one is still open, but "don't fake it" no
longer waits on that decision.

- Both still do the two `work_orders` status writes (`payment_releasing` →
  `completed`) unchanged, since those drive `work_order_events`,
  notifications, and `approved_at`. Nothing writes `payment_intents.status`
  or `captured_at` from either app anymore.
- Deliberate consequence: for any work order with a `payment_intent_id`
  linked to a row not already `'captured'` (the common case),
  `validate_work_order_transition()`'s existing money check now rejects the
  `completed` write for real, surfacing an actual error instead of a fake
  success. The work order rests at `payment_releasing` until
  `charge-customer` is reachable — exactly the "an error would be better
  than silently faking success" position fact 3 already argued for.
- Every user-facing string on both platforms that claimed money moved or
  was protected — approve buttons, toasts, push/email copy, terminal status
  banners, hero/status cards, badge labels — was reworded to say plainly
  that payment capture isn't live yet. Full diffs are in the commit history
  for this date range, both repos; nothing is summarized further here.
- Found during this pass, fixed the same way: a **third**, independent
  approve surface, `app/dashboard/customer/jobs/[id]/ApproveJobSection.tsx`
  + `notifyContractorWorkApproved()` (website) — writes `bookings.status =
  'approved'` directly, with no relationship to `work_orders` at all. Same
  false-claim copy, same fix. Still writes `bookings.status` as before; see
  "three bookings.status writers" below — this was not consolidated into
  the `work_orders` flow.

**`charge-customer` (path 3, the only real one) was repaired, but remains
completely unwired — nothing in either app calls it.** This pass only
fixed its own internal correctness, so it's honest and safe *once*
something does call it:
- Status gate now checks `status = 'payment_releasing'` directly, agreeing
  with `mark_work_order_paid`'s own `WHERE` clause. The old gate (`status
  IN ('approved','completed')`, `=== 'paid'`) checked against
  `work_order_status` enum values that can never occur — it silently only
  ever let `'completed'` through, which never matched
  `mark_work_order_paid`'s `WHERE status = 'payment_releasing'` at all.
  Even with Stripe fully wired, the old code could never have completed a
  real charge.
- `mark_work_order_paid()` (migration `20260923020000`) now uses `GET
  DIAGNOSTICS` to check its own affected-row count and raises on zero
  instead of silently no-op'ing. `charge-customer` now actually checks that
  RPC's error at both call sites instead of discarding it.
- Added a Stripe `Idempotency-Key` header (`charge-customer:<work_order_id>`)
  on the PaymentIntent create call.
- Added an atomic claim (`UPDATE work_orders SET stripe_payment_intent_id =
  <marker> WHERE status='payment_releasing' AND stripe_payment_intent_id IS
  NULL`) before the Stripe call, so two concurrent calls can't both create a
  PaymentIntent for the same work order; released back to `NULL` on any
  failure after claiming, so a genuine error doesn't permanently strand a
  work order at `claim:...`.
- Applied the previously-flagged "Fix 4": JWT validation now extracts the
  bearer token from the `Authorization` header and calls `getUser(token)`
  explicitly, instead of relying on ambient client session state a
  freshly-constructed client never has.
- Proved every change above without ever calling Stripe: a DB dry run
  against a real fixture (the status gate, the atomic claim winning/losing,
  `mark_work_order_paid`'s new zero-row failure), plus 15 Deno unit tests
  (`supabase/functions/charge-customer/logic.test.ts`, pure logic extracted
  into `logic.ts` so importing it doesn't trigger `Deno.serve()`) with
  `fetch` stubbed to hard-fail on any target that isn't the Stripe mock.

**Website payment hold: considered, deliberately not built.** The
website's customer work-order screen has no way to secure a payment hold —
mobile's `securePayment()` / `MockPaymentProvider` (`lib/payment/mock.ts`,
the only `PaymentProvider` implementation that exists) has no website
equivalent. Weighed building a website mock-hold UI — it would let a
DB-level `in_progress` payment gate (mirroring mobile's
`work-order-transition` check into `validate_work_order_transition()`) be
added safely for both platforms — against just being honest that it isn't
available. Chose honesty: the mock-hold UI is not reusable once real Stripe
card collection replaces it, and pre-launch, mock money securing nothing
doesn't protect anyone regardless of which platform reaches it. Building it
twice (mock now, Stripe later) for a feature whose only payoff is a DB gate
that doesn't guard anything real yet wasn't worth it. Landed instead:
- Website customer work-order screen (`CustomerWorkOrderClient.tsx`) shows
  a small card stating plainly that payment security isn't available on
  web yet, pointing to the app — or, if a real hold already exists
  (secured via the app), shows that truthfully instead.
- Website contractor work-order screen (`ContractorWorkOrderClient.tsx`)
  tells the contractor, when the next step is starting work with no held
  payment intent, that no payment hold is on file. Informational only —
  does not block starting work.
- The DB-level `in_progress` payment gate itself was **not added**. It
  remains mobile-app-level only, inside `work-order-transition`, exactly as
  it was before this pass.

### Remaining prerequisites (unchanged by this pass)

`charge-customer` cannot process a single real charge, repaired or not,
until all three of these exist — none of them do today:
- **Stripe Connect onboarding.** Nothing in either repo writes
  `contractors.stripe_account_id`. No onboarding flow exists anywhere.
- **Card collection.** Nothing in either repo writes
  `users.stripe_customer_id` / `stripe_payment_method_id`. No card-
  collection UI exists — mobile's `profile/payments.tsx` already says
  "Stripe payments coming soon" and disables its Add Card button, correctly.
- **A webhook receiver.** There is none in either repo.
  `charge-customer` creates PaymentIntents synchronously and only ever
  reads back its own writes; nothing catches async Stripe events
  (disputes, delayed captures, 3DS follow-up) if this goes live as-is.

### Open decisions, not made in this pass

1. **The `ensureWorkOrder()` placeholder collision — confirmed real.**
   Verified live against the schema: `payment_intents.status` defaults to
   `'pending_hold'::payment_intent_status`. Both `ensureWorkOrder()`
   (`app/dashboard/customer/jobs/[id]/work-order/actions.ts`) and its twin
   auto-create path in `app/dashboard/contractor/jobs/[id]/work-order/page.tsx`
   insert a `payment_intents` row with `amount_cents: 0` and no explicit
   `status`, then immediately point `work_orders.payment_intent_id` at it.
   **Every website-created work order has a non-null `payment_intent_id`
   from the moment it exists, referencing a `pending_hold` row that never
   advances.** Any future code — gates, UI, anything checking "is payment
   secured" — must check the linked row's `status`, never just whether
   `payment_intent_id` is non-null; presence alone means nothing here.
   `lib/work-order.ts`'s `hasRealPaymentHold()` (added this pass, backs the
   two honest-copy cards above) already does this correctly and is the
   reference implementation. Not decided: whether a future real hold action
   updates this placeholder row in place, or inserts a fresh row and
   re-points `payment_intent_id`, orphaning the placeholder.
2. **The hold amount source, if a website hold is ever built.** Mobile
   holds `booking.price_estimate` at accept time. The website's work order
   billing is line-item-driven and starts at `{ total: 0, ... }` — there's
   often nothing real to hold against at the point a customer would first
   see a hold control. Undecided.
3. **Three independent `bookings.status` "start job" writers**, unrelated
   to `work_orders` entirely and to each other: the contractor job list
   page, the job detail page (`ContractorJobActions.tsx`), and — separately
   — the work-order page's own `work_orders.status`-based flow.
   `bookings.status = 'in_progress'` is real, load-bearing state (it's the
   literal filter several list/calendar queries run on), not just a badge,
   and it carries pre-work-order-stage logic (`pending`/`accepted`/
   `cancelled`) the work-order state machine has no equivalent for at all.
   Not retired, not consolidated this pass — every reader listed would need
   migrating to `work_orders` first, and a pre-work-order-stage mechanism
4. **`charge-customer/index.ts:20-21` reads `STRIPE_SECRET_KEY` and
   `SUPABASE_URL` with a bare `Deno.env.get('...')!`** — a compile-time-only
   assertion that does nothing at runtime. If either var were ever actually
   unset, this would silently proceed and call Stripe with an undefined
   key instead of failing at startup. `getServiceKey()` two lines below it
   (`_shared/secretKey.ts`) already gets this right — throws a clear error
   immediately if misconfigured, rather than degrading silently. Fix these
   two lines to match that pattern (throw if missing) as part of whatever
   change actually wires a caller to this function — not worth a standalone
   patch to dead code today, but don't let it ship live still using `!`.
   would need to exist before any of the three could safely become a no-op.

## Update — 2026-10-01: client writes guarded, launch gate added

Proven 2026-09-28 with throwaway accounts (rolled back): either party could
write the money state of their own job directly, so every "captured" or
"approved" in the database was self-certifiable. Four guard triggers now
restrict direct client writes (migrations in the website repo,
`supabase/migrations/20260928_guard_*`); server paths — SECURITY DEFINER
functions and service-role callers, including `charge-customer` — are
unaffected.

- **bookings** — no client writes to payment, fee, payout, refund or
  cancellation-fee columns; status moves are per party (a contractor can't
  approve their own job, a customer can't complete one). Completing a job no
  longer flips `payment_status` held → released.
- **work_orders** — `billing` is always recalculated from `line_items` and
  can't be written directly (it's what `charge-customer` charges); only the
  customer can move `awaiting_approval → payment_releasing`; clients can't
  insert work orders at all.
- **payment_intents** — clients can only *insert* a mock hold (status
  `pending_hold`/`held`/`hold_failed`, provider `mock`, for their own
  booking). No client UPDATE or DELETE: capture, release and refund are
  server-only. `MockPaymentProvider.capturePayment/releaseHold/refund` have no
  callers and would now fail — delete them with the Stripe switch.
- **payment_line_items** — approval is always the customer's. Every
  contractor-added item starts `pending` (the website's "require customer
  approval" checkbox no longer has any effect — remove it); auto-approve
  still applies under the work order's `auto_approve_under_cents`, which
  clients can't set.

### Launch gate: `public.payments_live()`

Returns `false` today. **Flip it to `true` in the same change that makes real
capture live** (`CREATE OR REPLACE FUNCTION public.payments_live() RETURNS
boolean LANGUAGE sql STABLE AS $$ SELECT true $$;`). It controls two things:

1. **Completion without a payment.** While `false`, a work order that has
   *never* had a payment (no `payment_intent_id`, no `stripe_payment_intent_id`,
   no `payment_intents` row for its booking) may complete without one —
   nothing can be captured pre-launch. While `true`, every completion needs a
   captured payment. A work order that has had a payment always needs it
   captured, either way.
2. **Client-created holds.** While `false`, the customer's app may insert the
   mock hold. While `true`, payment intents come from the server only — so
   mobile's `securePayment()` must already be on the real Stripe hold before
   the flip, or securing a deposit breaks.

### Work orders stop at `payment_releasing` until Stripe is real — correct, expected

- **Website-created work orders** are created with a $0 `pending_hold`
  placeholder intent (open decision 1 above), so they have "had a payment".
  The website approve path moves them to `payment_releasing`, then the
  `completed` write fails with "payment must be captured first" and the work
  order rests there. Correct behaviour: nothing was captured.
- **Mobile work orders with a secured deposit** behave the same way: the mock
  hold is `held`, never `captured`, and clients can no longer capture it, so
  mobile approval also stops at `payment_releasing`.
- Only work orders that never had a payment attached complete today.

Nothing completes a paid work order until `charge-customer` is wired and
Stripe is live. Don't "fix" this by relaxing the gate.
