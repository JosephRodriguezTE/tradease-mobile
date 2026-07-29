# Tradease — Job Lifecycle (state-machine.md)

> This is the official list of what a job can be doing at any moment, and what's
> allowed to happen next. Think of it like the status stages on a work order:
> a job is always in exactly ONE state, and it can only move to certain next states.
> Nothing in the app is allowed to skip stages or invent new ones.
>
> This is a DRAFT for you to edit. Fix it to match how you actually want Tradease to
> work, THEN have Claude Code build from it. Editing here is free; fixing built code isn't.

---

## ⚠️ Reality check before you edit this (found by reading the actual code, 2026-07-19)

This draft's 9 states don't exist anywhere yet as a single column's values. Today, status is
split across THREE places, and they already have their own vocabulary:

| Table.column | Real values seen in code today |
|---|---|
| `bookings.status` | `draft` (mobile only) → `pending` → `confirmed` → ... → `completed` → `approved` \| `disputed`; also `cancelled` |
| `job_offers.status` | `quoted` → `accepted` \| `declined` \| `countered` (plus `customer_action` / `contractor_final` sub-fields, each independently `pending`/`accepted`/`declined`/`countered`) |
| `work_orders.wo_status` | `accepted` seen at creation (memory previously said the column was named `status` — **that was wrong**, the real column is `wo_status`) |

Specific collisions with this draft, needing your decision:
1. **"Accepted"** — is this meant to replace `bookings.status = 'confirmed'` (what "a contractor took the job" currently looks like in code — set in `app/job/[id].tsx:280` inside `acceptQuote()`), or is it really `job_offers.status = 'accepted'`, a different table? Right now both change together in the same function but they're two separate columns.
2. **"Change Order Pending"** vs. existing **"countered"** — `job_offers` already has a whole counter-offer mechanic (`counter_price`, `counter_note`, `counter_expires_at`, min 70% of quoted price — see `app/job/[id].tsx:333-354`). But that's a **pre-acceptance price negotiation**, before any contractor is confirmed. Your "Change Order Pending" is described as happening **after** "In Progress" — mid-job scope change. These are different moments even though the mechanic (new price, waiting on approval) is similar. Should they share code/table, or are they genuinely unrelated and this draft should rename one to avoid confusion?
3. **"Rescheduled"** — no `rescheduled` status value found anywhere in code today. `scheduled_at`/`booking_time` are plain timestamp fields on `bookings` and `job_offers`, updated in place with no history — so today, "rescheduling" just silently overwrites the old date with no record it happened. If you want a real `Rescheduled` state (not just a silently-updated timestamp), that's new behavior, not a rename of something existing.
4. **`approved` / `disputed`** — these two real, live values (referenced in `SKILL.md`'s bookings RLS policy: customer can move `completed → approved` or `completed → disputed`) aren't in your 9-state list at all. Does "Completed" in this draft absorb both, or does dispute handling need its own row in the table above (this ties into Part 8's "Dispute Resolution," listed as MISSING in `SKILL.md` — i.e. dispute status values may exist in the RLS policy but have no UI yet)?
5. **`cancelled`** (real value, referenced in the same RLS policy) — is this the same thing as your "No-Fault Cancelled," or a second, different cancelled state (e.g. an at-fault one)?

None of this is fixed yet — flagging it so you can edit the table below with full information instead of on an empty page.

---

## The states (what a job can be doing)

| State | Plain meaning |
|---|---|
| **Requested** | Customer posted the job. No contractor yet. |
| **Accepted** | A contractor took it. Chat unlocks now. |
| **Scheduled** | A date/time (or a window) is agreed. |
| **In Progress** | Contractor is on site / doing the work. |
| **Change Order Pending** | Work is bigger/different than posted. New price sent, waiting on customer to approve. |
| **Rescheduled** | Date got moved. Goes back to Scheduled once a new date is set. |
| **No-Fault Cancelled** | Job stopped for a legit reason, nobody gets penalized. |
| **Completed** | Work is done. Rating can happen now. |
| **Paid** | Money settled. (Offline for launch; Stripe later.) |

---

## What's allowed to happen next (the transitions)

```
Requested
  -> Accepted             (a contractor takes the job)
  -> No-Fault Cancelled   (nobody accepts / customer cancels early)

Accepted
  -> Scheduled            (both agree on a date/window)
  -> No-Fault Cancelled   (contractor backs out before scheduling)

Scheduled
  -> In Progress          (contractor taps "I'm here" and starts)
  -> Rescheduled          (either side moves the date)
  -> No-Fault Cancelled   (see reasons below)

Rescheduled
  -> Scheduled            (new date set)

In Progress
  -> Change Order Pending (scope changed, new price needed)
  -> Completed            (work finished as posted)
  -> No-Fault Cancelled   (unsafe / can't complete)

Change Order Pending
  -> In Progress          (customer approves new price)
  -> No-Fault Cancelled   (customer rejects, job ends clean)

Completed
  -> Paid                 (money settled)
```

---

## No-Fault Cancelled reasons (required when this state is chosen)
The contractor or customer MUST pick one. These do **not** hurt anyone's rating:
- Bad description (job wasn't what was posted)
- No access (nobody home / couldn't get in)
- Unsafe (gas leak, live wire, structural — contractor exits, logged for liability)
- Out of scope (contractor doesn't do this kind of work)
- Customer changed mind

---

## What every status change must record
Every time a job's state changes, save:
- `status` — the new state
- `status_reason` — why (required for No-Fault Cancelled and Change Orders)
- `changed_by` — customer, contractor, or system
- timestamp

This record is your evidence trail for any dispute. Without it, it's your word
against theirs. With it, you can see exactly what happened and when.

⚠️ None of these three columns (`status_reason`, `changed_by`, and a real `status`
history) exist on `bookings`, `job_offers`, or `work_orders` today, as far as the code
shows. This is new schema, not a rename — flag for the Part 6 migration prompt once
the table/column questions above are settled.

---

## Rules built on top of this
- Ratings only unlock at **Completed**. No-Fault Cancelled = no rating.
- Chat unlocks at **Accepted**, not before.
- "I'm here" arrival button is what moves Scheduled -> In Progress (timestamped).
- Just Leads contractors never enter this flow through booking — leads only.
- <fill: anything else you want enforced>
