-- Consolidate the status / wo_status drift.
--
-- Today: aa_mirror_wo_status mirrors wo_status -> status only (one direction).
-- trg_wo_transition_guard and trg_wo_after_status are BEFORE/AFTER UPDATE OF status
-- only, so they never fire on wo_status-only writes -- which is all of mobile's
-- real traffic (work-order-transition edge function writes wo_status exclusively).
-- The website's ContractorWorkOrderClient.tsx writes status directly, with no
-- server-side gate at all. This migration makes both columns bidirectionally
-- mirrored, re-scopes the guard/event triggers to fire on either column, and
-- adds the change-order graph edges that are already reachable in practice
-- but were never valid per the state graph.

-- 1) Graph edges.
--    - arrived / waiting_for_customer / materials_needed -> change_order_pending:
--      fn_handle_change_order_insert() (trg_change_order_insert on
--      payment_line_items) already writes wo_status into this state from these
--      three statuses today. The guard has just never been in that write's path
--      until now, since it only fired on `status`.
--    - accepted -> en_route: the website has no deposit_secured concept at all --
--      ContractorWorkOrderClient.tsx's getNextActions() offers "I'm En Route"
--      directly from `accepted`. This edge exists because the website skips the
--      deposit step entirely, not because skipping it is correct — see the
--      payment-hold gap noted separately (report only, not fixed here).

-- 2) Bidirectional mirroring, both directions guarded against ping-pong.
--    Naming: "aa_" prefix matches the codebase's existing convention for
--    forcing a trigger to run before the rest (see aa_mirror_wo_status).
--    Alphabetically, aa_mirror_status_to_wo_status < aa_mirror_wo_status, so
--    on a statement that explicitly sets both columns to conflicting values
--    (nothing today does), status wins -- aa_mirror_status_to_wo_status runs
--    first and overwrites wo_status to match status; aa_mirror_wo_status then
--    runs and finds wo_status already equal to status, so it's a no-op.

CREATE OR REPLACE FUNCTION public.mirror_status_to_wo_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if NEW.status is distinct from OLD.status
     and NEW.wo_status is distinct from NEW.status then
    NEW.wo_status := NEW.status;
  end if;
  return NEW;
end
$function$;

CREATE TRIGGER aa_mirror_status_to_wo_status
  BEFORE UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION mirror_status_to_wo_status();

CREATE OR REPLACE FUNCTION public.mirror_wo_status_to_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if NEW.wo_status is distinct from OLD.wo_status
     and NEW.status is distinct from NEW.wo_status then
    NEW.status := NEW.wo_status;
  end if;
  return NEW;
end
$function$;

-- 3) Re-scope the guard and event triggers to OF status, wo_status, and make
--    both functions read COALESCE(NEW.wo_status, NEW.status) rather than
--    depending on trigger firing order. Note: since neither column is
--    nullable, COALESCE always resolves to NEW.wo_status today -- and because
--    both aa_ mirrors fire alphabetically before either of these (before any
--    trg_-prefixed trigger), NEW.status and NEW.wo_status are already equal
--    by the time these run, for every single-column write that exists in the
--    codebase today. The COALESCE is real protection only against a future
--    nullable-column change or a mirror trigger being dropped/reordered --
--    it is not doing extra work right now.

CREATE OR REPLACE FUNCTION public.validate_work_order_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_status work_order_status := OLD.status;
  v_new_status work_order_status := COALESCE(NEW.wo_status, NEW.status);
BEGIN
  IF v_old_status = v_new_status THEN RETURN NEW; END IF;

  IF NOT (
    (v_old_status = 'submitted'            AND v_new_status IN ('accepted','cancelled')) OR
    (v_old_status = 'accepted'             AND v_new_status IN ('deposit_secured','en_route','cancelled')) OR
    (v_old_status = 'deposit_secured'      AND v_new_status IN ('en_route','cancelled')) OR
    (v_old_status = 'en_route'             AND v_new_status IN ('arrived','cancelled')) OR
    (v_old_status = 'arrived'              AND v_new_status IN ('in_progress','change_order_pending','cancelled')) OR
    (v_old_status = 'in_progress'          AND v_new_status IN ('waiting_for_customer','materials_needed',
                                           'change_order_pending','awaiting_approval','completed','disputed')) OR
    (v_old_status = 'waiting_for_customer' AND v_new_status IN ('in_progress','change_order_pending','disputed')) OR
    (v_old_status = 'materials_needed'     AND v_new_status IN ('in_progress','change_order_pending','disputed')) OR
    (v_old_status = 'change_order_pending' AND v_new_status IN ('in_progress','awaiting_approval')) OR
    (v_old_status = 'awaiting_approval'    AND v_new_status IN ('payment_releasing','in_progress','disputed')) OR
    (v_old_status = 'payment_releasing'    AND v_new_status IN ('completed')) OR
    (v_old_status = 'disputed'             AND v_new_status IN ('completed','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid work order transition: % → %', v_old_status, v_new_status;
  END IF;

  -- Money consistency: completing requires captured payment
  IF v_new_status = 'completed' AND NEW.payment_intent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM payment_intents WHERE id = NEW.payment_intent_id AND status = 'captured'
    ) THEN
      RAISE EXCEPTION 'Cannot complete work order: payment must be captured first';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.after_work_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_label text;
  v_old_status work_order_status := OLD.status;
  v_new_status work_order_status := COALESCE(NEW.wo_status, NEW.status);
BEGIN
  -- OF status, wo_status fires whenever either column is in the SET list, even
  -- if the mirrored value ends up unchanged (e.g. a statement that re-sets a
  -- column to its current value) -- guard against logging a no-op transition.
  IF v_old_status = v_new_status THEN RETURN NEW; END IF;

  v_label := CASE v_new_status::text
    WHEN 'submitted'            THEN 'Work order submitted'
    WHEN 'accepted'             THEN 'Contractor accepted the job'
    WHEN 'deposit_secured'      THEN 'Deposit secured — payment held'
    WHEN 'en_route'             THEN 'Contractor is on the way'
    WHEN 'arrived'              THEN 'Contractor has arrived'
    WHEN 'in_progress'          THEN 'Work is in progress'
    WHEN 'waiting_for_customer' THEN 'Waiting for customer confirmation'
    WHEN 'materials_needed'     THEN 'Additional materials needed'
    WHEN 'change_order_pending' THEN 'Change order submitted — awaiting approval'
    WHEN 'awaiting_approval'    THEN 'Work complete — awaiting your approval'
    WHEN 'payment_releasing'    THEN 'Payment releasing'
    WHEN 'completed'            THEN 'Job completed'
    WHEN 'cancelled'            THEN 'Job cancelled'
    WHEN 'disputed'             THEN 'Dispute opened'
    ELSE 'Status updated to ' || v_new_status::text
  END;

  INSERT INTO work_order_events (work_order_id, event_type, actor_id, label, payload)
  VALUES (
    NEW.id, 'status_changed', auth.uid(), v_label,
    jsonb_build_object('from', v_old_status::text, 'to', v_new_status::text)
  );

  -- Delete live location when leaving en_route (privacy + cleanup)
  IF v_old_status = 'en_route' THEN
    DELETE FROM contractor_locations WHERE work_order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER trg_wo_transition_guard ON public.work_orders;
CREATE TRIGGER trg_wo_transition_guard
  BEFORE UPDATE OF status, wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION validate_work_order_transition();

DROP TRIGGER trg_wo_after_status ON public.work_orders;
CREATE TRIGGER trg_wo_after_status
  AFTER UPDATE OF status, wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION after_work_order_status_change();

-- 4) Backfill. Currently 0 rows differ; kept for correctness / re-runnability.
UPDATE public.work_orders SET status = wo_status WHERE status IS DISTINCT FROM wo_status;

-- status is retained as a mirrored column, not dropped -- charge-customer and
-- mark_work_order_paid still read/write it untouched.
