-- ============================================================================
-- enforce_portfolio_limit() and check_employee_limit() read plan_limits
-- without SECURITY DEFINER. plan_limits has RLS enabled with zero policies,
-- so as regular (non-superuser) triggers their internal SELECT was blocked
-- for any real authenticated caller, v_limit came back NULL, and both
-- functions' comparisons (`v_limit IS NOT NULL AND ...` /
-- `v_limit != -1 AND ...`) treat NULL as "no limit" -- fail open. Confirmed
-- both paths are live-reachable: enforce_portfolio_limit() explicitly gates
-- on auth.role() = 'authenticated', and owner_manage_employees lets a
-- contractor insert into contractor_employees directly (no edge function
-- required). Every contractor on every plan has been able to bypass both
-- caps entirely.
--
-- Fixed: both now SECURITY DEFINER with SET search_path, so their internal
-- reads bypass RLS the same way the views built this session do. Also
-- closed the fail-open itself -- a plan with no matching plan_limits row
-- now raises its own distinct exception rather than silently allowing
-- unlimited. contractors.plan has no CHECK constraint tying it to
-- plan_limits' 3 rows (free/leads/pro), so a missing-row case is real, not
-- hypothetical -- a typo or a new plan added to one table but not the other
-- should surface loudly as a config gap, not disguise itself as "your plan
-- grants zero".
--
-- Proof: free plan (photo_limit=5, employee_accounts=3) -- 5 photos and 3
-- employees succeed, the 6th photo and 4th employee are both blocked with
-- the real limit quoted from plan_limits. Pro plan (photo_limit=15,
-- employee_accounts=-1) -- 15 photos succeed, 16th blocked at "limit (15)";
-- 5 employees succeed (unlimited). A contractor with a plan value not in
-- plan_limits gets the new distinct "No plan limit configured" error
-- instead of being silently let through.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_portfolio_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  IF current_setting('app.bypass_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.portfolio_photos IS DISTINCT FROM OLD.portfolio_photos AND auth.role() = 'authenticated' THEN
    SELECT photo_limit INTO v_limit FROM public.plan_limits WHERE plan = COALESCE(NEW.plan, 'free');

    IF v_limit IS NULL THEN
      RAISE EXCEPTION 'No plan limit configured for plan % -- contact support', COALESCE(NEW.plan, 'free')
        USING ERRCODE = 'P0001';
    END IF;

    v_count := jsonb_array_length(COALESCE(NEW.portfolio_photos, '[]'::jsonb));
    IF v_count > v_limit THEN
      RAISE EXCEPTION 'Portfolio photo limit (%) exceeded for % plan', v_limit, COALESCE(NEW.plan,'free') USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_employee_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan          TEXT;
  v_limit         INTEGER;
  v_current_count INTEGER;
BEGIN
  SELECT plan INTO v_plan
  FROM public.contractors
  WHERE id = NEW.contractor_id;

  SELECT employee_accounts INTO v_limit
  FROM public.plan_limits
  WHERE plan = COALESCE(v_plan, 'free');

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'No plan limit configured for plan % -- contact support', COALESCE(v_plan, 'free')
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.contractor_employees
  WHERE contractor_id = NEW.contractor_id
    AND status IN ('invited', 'active');

  -- -1 means unlimited (Pro plan)
  IF v_limit != -1 AND v_current_count >= v_limit THEN
    RAISE EXCEPTION 'Employee limit reached for % plan. Limit: %. Upgrade to add more employees.',
      COALESCE(v_plan, 'free'), v_limit;
  END IF;

  RETURN NEW;
END;
$function$;
