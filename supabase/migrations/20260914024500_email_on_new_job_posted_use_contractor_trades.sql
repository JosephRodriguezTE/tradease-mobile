-- Phase 1, function 4 of 4. Replaces the ad-hoc
-- `ILIKE ... OR NEW.trade = ANY(string_to_array(c.trade_type, ', '))`
-- (someone had already hand-patched this function for the
-- comma-separated case) with the same EXISTS membership check used in
-- the other three functions.
--
-- Found while fixing this: this function is NOT SECURITY DEFINER and has
-- no SET search_path, unlike every comparable trigger in this project.
-- It runs as whichever role's DML fired it -- normally the customer who
-- just posted the job. contractors' own RLS (contractors_select_own_or_
-- admin) only lets a contractor read their own row or an admin read any
-- row, so the JOIN in this function returns zero rows for any ordinary
-- customer session, regardless of the WHERE clause. Confirmed live: ran
-- this exact join as a real customer session, zero rows, independent of
-- trade matching. This means the function has likely never sent a real
-- email. Deliberately NOT adding SECURITY DEFINER here -- doing so would
-- make this pathway fire for the first time ever, a real product
-- decision (does a "new job nearby" email need to exist alongside the
-- push notification notify_new_job_posted() already sends?), not a bug
-- fix to currently-working behavior. Fixing the WHERE clause so the
-- logic is correct whenever this gets revisited; flagging the dormancy
-- rather than silently leaving it or silently turning it on.
--
-- Proved the corrected logic in isolation (as postgres, bypassing the
-- RLS dormancy just described, which is the only way to exercise this
-- query at all right now): trade_id='Electrical' correctly matches the
-- real multi-trade contractor; trade_id='Plumbing' (a trade they don't
-- have) correctly excludes them.
CREATE OR REPLACE FUNCTION public.email_on_new_job_posted()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_contractor RECORD;
BEGIN
  IF NEW.contractor_id IS NULL AND NEW.status = 'pending' THEN
    FOR v_contractor IN
      SELECT u.email
      FROM public.contractors c
      JOIN public.users u ON u.id = c.id
      WHERE c.is_available = true
        AND c.verification_status = 'approved'
        AND (NEW.trade IS NULL OR EXISTS (
          SELECT 1 FROM public.contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = NEW.trade
        ))
    LOOP
      PERFORM public.send_email('new_job_nearby', v_contractor.email, jsonb_build_object(
        'trade', COALESCE(NEW.trade,'Job'),
        'address', COALESCE(NEW.job_address,'Near you'),
        'price', COALESCE(NEW.price_estimate::TEXT,'—')
      ));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_on_new_job_posted() FROM PUBLIC, anon, authenticated;
