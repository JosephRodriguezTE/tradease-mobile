# Payment Flow State — Work Order Completion → Payout

Audit date: 2026-08-30. Read-only investigation, no code changed. Written to be actionable cold, without re-deriving anything.

## If you read nothing else

**No path currently moves real money from a completed job to a contractor payout.** All three ways a work order can reach "approved" either crash, silently no-op, or fake the Stripe capture with a direct database write. This is currently harmless only because `work_orders` holds a single row total — there is effectively no production traffic through this flow yet. The moment real jobs start completing at volume, contractors stop getting paid, with no error visible to them (the sweep fails silently server-side; the customer-facing paths report success).

---

## 1. The real `work_order_status` graph

Enforced by `validate_work_order_transition()` (trigger `trg_wo_transition_guard`, `BEFORE UPDATE OF status`). This is the actual, coherent state machine — verified live via `pg_get_functiondef`, not inferred.

```
submitted            → accepted, cancelled
accepted              → deposit_secured, cancelled
deposit_secured       → en_route, cancelled
en_route              → arrived, cancelled
arrived               → in_progress, cancelled
in_progress           → waiting_for_customer, materials_needed,
                         change_order_pending, awaiting_approval,
                         completed, disputed
waiting_for_customer   → in_progress, disputed
materials_needed       → in_progress, disputed
change_order_pending   → in_progress, awaiting_approval
awaiting_approval       → payment_releasing, in_progress, disputed
payment_releasing       → completed
disputed                → completed, cancelled
```

Full valid enum values, in declared order (`pg_enum.enumsortorder`):
```
submitted, accepted, deposit_secured, en_route, arrived, in_progress,
waiting_for_customer, materials_needed, change_order_pending,
awaiting_approval, payment_releasing, completed, cancelled, disputed
```

**`'approved'` and `'paid'` are not members of this enum. They never have been, per `mark_work_order_paid`'s own migration comment** (`20260827151215_fix_mark_work_order_paid_auth_and_enum.sql`):
> "'approved' and 'paid' are not valid work_order_status enum values — every call to this function threw 22P02 (invalid enum input) for every caller, before this fix, regardless of auth. Corrected to the real state machine per fn_guard_wo_status_transition and validate_work_order_transition, which both only allow payment_releasing → completed; there is no separate 'paid' state, completed is the terminal paid state."

`validate_work_order_transition()` also enforces one money-consistency rule: reaching `completed` with a `payment_intent_id` set requires that `payment_intents` row to already have `status = 'captured'`.

`mark_work_order_paid(work_order_id, stripe_payment_intent_id)` is the one function that correctly performs the terminal transition: validates the PI string looks like `pi_...`, then `UPDATE work_orders SET status='completed', paid_at=NOW(), stripe_payment_intent_id=... WHERE status='payment_releasing'`. `EXECUTE` is `service_role`-only (verified: real `permission denied` as `authenticated`). Its only caller is `charge-customer`.

---

## 2. The `status` / `wo_status` dual-column situation — the least obvious finding, easiest to lose

`work_orders` has **two separate columns, both typed `work_order_status`**: `status` and `wo_status`. Both default to `'submitted'`.

A trigger keeps them in sync — but only in one direction, and only sometimes:

```sql
-- aa_mirror_wo_status: BEFORE UPDATE OF wo_status
CREATE FUNCTION mirror_wo_status_to_status() RETURNS trigger AS $$
begin
  if NEW.wo_status is distinct from OLD.wo_status then
    NEW.status := NEW.wo_status;
  end if;
  return NEW;
end $$;
```

**The app's real transition function, `work-order-transition` (edge function), only ever writes `wo_status`** — it builds `updatePayload = { wo_status: new_status, ...extra_columns }` and calls `.update(updatePayload)`. It never puts `status` in that object.

Here is the part that matters: **Postgres decides which `UPDATE OF <column>` triggers fire based on which columns appear in the statement's own `SET` list — not on which values actually change at runtime.** An `UPDATE work_orders SET wo_status = 'awaiting_approval' WHERE id = ...` statement only fires triggers registered for `OF wo_status` (`aa_mirror_wo_status`) plus unqualified `BEFORE UPDATE` triggers. **It does not fire `trg_wo_transition_guard`, even though `aa_mirror_wo_status`'s own function body sets `NEW.status` inside that same statement.** The guard is registered `OF status`, and `status` was never in the client's SET list — the fact that a trigger *body* assigns it doesn't retroactively add it to the statement's trigger-firing decision.

**Net effect: `validate_work_order_transition()` — the only real state-graph enforcement in the database — never runs for any transition the app itself makes.** It only fires for code that writes `status` directly. Today that's exactly three things: `sweep_auto_approve_work_orders`, `mark_work_order_paid`, and the website's `approveWorkOrder()`. Every contractor-driven transition (accept, en route, arrived, in progress, mark complete, etc.) goes through `wo_status` and is validated by nothing. It happens to land in legal states today only because `work-order-transition`'s own JS logic agrees with the graph by convention — nothing in the database would catch it if it stopped agreeing.

Trigger firing order on `work_orders` (alphabetical by name, per Postgres's BEFORE-trigger convention — `aa_` prefix is a deliberate ordering hack to run first):
```
aa_mirror_wo_status          BEFORE UPDATE OF wo_status  → mirror_wo_status_to_status()
recalc_billing                BEFORE INSERT/UPDATE OF line_items → recalc_work_order_billing()
trg_set_auto_approve_at       BEFORE UPDATE (unqualified) → set_auto_approve_at()
trg_wo_after_status           AFTER UPDATE OF status      → after_work_order_status_change()
trg_wo_created                AFTER INSERT                → after_work_order_created()
trg_wo_number                 BEFORE INSERT                → generate_work_order_number()
trg_wo_transition_guard       BEFORE UPDATE OF status     → validate_work_order_transition()
trg_wo_updated_at             BEFORE UPDATE (unqualified) → touch_updated_at()
```

One more piece of drift this causes: `set_auto_approve_at()` only sets `auto_approve_at` when `NEW.status` becomes `'completed'` (24-hour window):
```sql
IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
  NEW.completed_at    := NOW();
  NEW.auto_approve_at := NOW() + INTERVAL '24 hours';
END IF;
```
But `work-order-transition`'s JS sets `auto_approve_at` itself, at **72 hours**, when `wo_status` becomes `'awaiting_approval'` — a different trigger condition, a different status value, a different duration. Because this update goes through `wo_status`, `set_auto_approve_at()`'s own condition (`NEW.status = 'completed'`) is false at the point it runs (status was just mirrored to `'awaiting_approval'`, not `'completed'`), so it does nothing — the JS-supplied 72-hour value survives *by accident*, not because the two pieces of code agree. They don't; nothing has ever reconciled them.

---

## 3. All three approve paths, and exactly how each one fails

### Path A — `sweep_auto_approve_work_orders` (Postgres, `pg_cron`, every 15 minutes)
```sql
FOR v_wo IN
  SELECT id FROM public.work_orders
  WHERE status = 'completed' AND auto_approve_at IS NOT NULL AND auto_approve_at <= NOW()
LOOP
  UPDATE public.work_orders SET status = 'approved' WHERE id = v_wo.id;  -- (1)
  PERFORM net.http_post(url := '.../charge-customer', ...);              -- (2)
END LOOP;
```
**Fails at the query, before it can even reach the broken UPDATE.** No live path ever sets `status` (or `wo_status`) to `'completed'` at the "waiting for approval" step — that step is `'awaiting_approval'`. `'completed'` is the *terminal* state in the real graph, reached only via `payment_releasing → completed`. So the `WHERE status = 'completed'` filter can never match a work order that is genuinely sitting in the auto-approve window. Even in the hypothetical case a row did match, line (1) would throw immediately — `'approved'` is not a valid enum literal, rejected by Postgres at the type-coercion level, before the transition guard or anything else runs. There is no `EXCEPTION` block, so this would fail the entire cron run (visible as `status: 'failed'` in `cron.job_run_details`) rather than degrading gracefully.

**Run history checked**: 100 consecutive runs (`cron.job_run_details`, back to 2026-08-28 19:30), every one `status: "succeeded"`, `return_message: "1 row"`. That return value is what a `void`-returning function always reports for `SELECT fn()` — it says nothing about the loop body. Combined with `work_orders` currently holding exactly one row, this function has almost certainly never processed a single real work order, successfully or otherwise, in its history.

### Path B — website `ApproveJobSection.tsx`, `handleApprove()`
```ts
await supabase.from('bookings').update({ status: 'approved' }).eq('id', bookingId)...
```
Operates on **`bookings.status`** — a plain `text` column on a different table entirely. Never touches `work_orders`, `payment_intents`, or Stripe in any way. Succeeds every time, does nothing about payment. Wired to a real, live button.

### Path C — website `CustomerWorkOrderClient.tsx` → `approveWorkOrder()` (in `work-order/actions.ts`)
```ts
if (wo.payment_intent_id) {
  await admin.from('payment_intents')
    .update({ status: 'captured', captured_at: new Date().toISOString() })
    .eq('id', wo.payment_intent_id)
}
await supabase.from('work_orders').update({ status: 'payment_releasing' }).eq('id', workOrderId)
await supabase.from('work_orders').update({ status: 'completed' }).eq('id', workOrderId)
```
This is the only one of the three that correctly walks the real graph (`awaiting_approval → payment_releasing → completed`, writing `status` directly so the transition guard *does* fire and validate it). It is also wired to a real, live button, on a different screen than Path B.

**Its failure is the payment step, not the status transition.** "Capturing" the payment is a direct `UPDATE payment_intents SET status = 'captured'` — a database write with no corresponding call to Stripe's capture API anywhere in this function. The work order correctly reaches `completed`; the customer's card is never actually charged for real. There is no Stripe webhook receiver in the project (confirmed separately) to catch or reconcile this afterward. `mark_work_order_paid` — the function actually designed for this transition, with its `pi_...` format check — is never called from here either.

### The one function that talks to Stripe for real
`charge-customer` is the only code in the entire project that calls `api.stripe.com` to create, confirm, or capture a PaymentIntent. **It has exactly one caller, in the whole codebase: `sweep_auto_approve_work_orders`** — confirmed by grepping both repos for `charge-customer`; the only hits are its own function file, migration/doc history, and the broken sweep. Since Path A never functions, `charge-customer`'s real-money code is currently unreachable from any live trigger, cron job, or button in the product.

---

## 4. The dead alternate implementation — two competing designs coexist

Three functions exist in the database, fully defined, syntactically valid — and **attached to zero triggers anywhere** (confirmed by joining `pg_trigger` to `pg_proc` on their names — no rows):

- **`handle_work_order_completed()`** — an entire alternate implementation of this same feature, using a simple linear chain on the *same* `status` column:
  ```sql
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW(); NEW.auto_approve_at = NOW() + INTERVAL '24 hours';
  END IF;
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN NEW.approved_at = NOW(); END IF;
  IF NEW.status = 'paid'     AND OLD.status != 'paid'     THEN NEW.paid_at     = NOW(); END IF;
  ```
- **`notify_payment_approved()`**, **`email_on_payment_approved()`** — both keyed on `NEW.status = 'approved'`, sending a contractor payout notification/email. Dead in the same way.

These three are internally consistent with each other and with `sweep_auto_approve_work_orders`/`charge-customer`'s assumptions (`completed → approved → paid`, three literal status values, 24-hour window). They are **not** consistent with `validate_work_order_transition()`, `mark_work_order_paid`, or the real enum. This is strong evidence of two sequential designs: an older, simpler one (these three functions, plus the sweep and charge-customer, which were apparently never updated), and a newer one that replaced it (`awaiting_approval`/`payment_releasing`, the transition guard, `mark_work_order_paid`) — built without ever removing or reconciling the first. Nothing currently depends on the dead three; they cannot fire.

---

## 5. Four other `approved`/`paid` vocabularies exist — unrelated, do not touch

A project-wide search for `'approved'`/`'paid'` returns ~50 files across both repos. Only the items in section 3–4 are part of this bug. Everything else belongs to a genuinely different column, on a genuinely different table, with its own independent, apparently-functioning meaning:

1. **`bookings.status`** (plain `text`, not an enum) — `submit_review()`, `enforce_pre_booking_message_cap()`, `ApproveJobSection.tsx` (Path B above) all read/write this. Separate lifecycle from work orders.
2. **`contractors.verification_status` / `approval_status`** — contractor vetting/onboarding. `admin_review_verification()`, `contractors_nearby()`, `get_ranked_contractors()`, `sync_verification_status()`, `email_on_verification_change()`.
3. **`payment_line_items.approval_status`** — mid-job change-order line items. `before_line_item_approval()`, `fn_handle_change_order_approval()` (this one correctly writes `work_orders.wo_status`, not `status`, when resuming work after a change order — consistent with the real design).
4. **`cancellations.refund_status` / `bookings.refund_status`** — refund request lifecycle. `handle_booking_cancellation()`, `notify_refund_status_change()`.

None of these reference `work_orders.status`/`wo_status`. Editing any of them in service of this fix would be a scope error.

---

## Decisions needed before any fix

No recommendation given here by design — these are genuine open questions with real tradeoffs.

### 1. Auto-approve window: 24 hours or 72 hours?
- **24h** matches the DB trigger (`set_auto_approve_at`) and the dead `handle_work_order_completed`'s original assumption. Faster contractor payout; less time for a customer to notice and dispute a problem before money auto-releases.
- **72h** matches `work-order-transition`'s current live JS behavior (what's actually shipping today, even though nothing reconciles it against the DB-side 24h logic). More customer protection window; slower contractor cash flow.
- Whichever is chosen, the *other* piece of code needs to be corrected or removed so there's a single source of truth for this timer — right now there are two, and they only fail to conflict by accident (see section 2).

### 2. Two competing customer "approve" buttons — which one is real?
- **Keep Path B (`ApproveJobSection` / `bookings.status`)** as the real path: simpler, but requires building real work-order/payment integration into it from scratch — right now it does neither.
- **Keep Path C (`CustomerWorkOrderClient` / `approveWorkOrder` / `work_orders.status`)** as the real path: already follows the correct state graph; still needs its payment-capture step made real (see decision 4).
- **Merge them** into one screen/action: removes the ambiguity but requires knowing which one customers currently see in production (which page is actually linked from notifications/dashboard) before either can be safely retired.
- Whichever is discarded, confirm nothing else links to it first — both are currently live, wired-up code paths, not dead code.

### 3. Delete the dead alternate implementation, or leave it?
- **Delete** `handle_work_order_completed`, `notify_payment_approved`, `email_on_payment_approved`: they're attached to nothing, provably unreachable, and their continued existence is exactly what makes a future `grep` for "approved"/"paid" misleading (which is how several of this audit's leads initially looked like live bugs before being confirmed dead).
- **Leave them**: preserves them as a readable record of the earlier design, in case any of their logic (payout notification/email copy, the 24h constant) is wanted when building the real fix. The migration history already carries this context in git, so this isn't the only record.

### 4. What should Path C's payment capture actually do?
- **Call `charge-customer`** (or a similar path that hits Stripe for real) instead of writing `payment_intents.status = 'captured'` directly. This is likely the "correct" fix in spirit, but changes the shape of `approveWorkOrder()` meaningfully — it would need to await a real external API call and handle its failure modes (currently it can't fail at this step; a real Stripe call can).
- **Call `mark_work_order_paid`** after a real capture succeeds, instead of the current two raw `.update()` calls — this is the function actually built for this exact transition, with its `pi_...` format check, and it's currently unused by any live caller.
- Either choice needs a decision on error handling: today, if the DB writes in Path C succeed, the UI reports success unconditionally. A real Stripe call introduces a failure mode (declined card, expired auth window) that the current code has no path for.

### 5. Should `trg_wo_transition_guard` be re-scoped to also fire on `wo_status`?
- **Yes** — change it to `BEFORE UPDATE OF status, wo_status`, so the real state graph is actually enforced for the app-driven flow (today it silently isn't, per section 2). Risk: `work-order-transition`'s JS may currently rely on transitions the strict graph doesn't technically allow (not verified in this audit — would need its own check before flipping this on).
- **No** — leave it as-is, and treat `wo_status` as the trusted source with `status` as a passive mirror, accepting that the guard only protects the small set of direct-`status`-writing backend paths. Simpler, but leaves the gap this audit found in place indefinitely.
