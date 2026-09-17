# LAUNCH BLOCKER — no path currently moves real money

**This is not a cleanup note. Do not schedule this as tech debt.** Until this is
resolved, completing a real job in production does not pay the contractor,
regardless of which app the customer approves from.

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
