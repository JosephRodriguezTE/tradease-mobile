-- ============================================================================
-- Consolidate contractor plan/billing guards
--
-- Two independent triggers on public.contractors both guarded plan,
-- stripe_customer_id, and stripe_subscription_id against direct
-- authenticated writes. Neither was ever recorded in a migration — both
-- were applied directly to the live DB. Captured here, verbatim, from
-- pg_get_functiondef()/pg_get_triggerdef() before this migration changes
-- anything, since this is the only record of their prior state that will
-- exist:
--
--   CREATE TRIGGER guard_contractor_billing BEFORE UPDATE ON public.contractors
--     FOR EACH ROW EXECUTE FUNCTION protect_contractor_billing_fields();
--
--   CREATE OR REPLACE FUNCTION public.protect_contractor_billing_fields()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--   AS $function$
--   BEGIN
--     -- auth.uid() is NULL when called by service_role → allow those writes through
--     IF auth.uid() IS NOT NULL THEN
--       NEW.plan                    := OLD.plan;
--       NEW.stripe_customer_id      := OLD.stripe_customer_id;
--       NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
--     END IF;
--     RETURN NEW;
--   END;
--   $function$
--
--   CREATE TRIGGER guard_plan_update BEFORE UPDATE ON public.contractors
--     FOR EACH ROW EXECUTE FUNCTION prevent_plan_self_update();
--
--   CREATE OR REPLACE FUNCTION public.prevent_plan_self_update()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--   AS $function$
--   BEGIN
--     IF auth.uid() IS NOT NULL AND (
--       NEW.plan IS DISTINCT FROM OLD.plan OR
--       NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
--       NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
--     ) THEN
--       RAISE EXCEPTION 'Plan and billing fields can only be updated by the system';
--     END IF;
--     RETURN NEW;
--   END;
--   $function$
--
-- Postgres fires same-timing BEFORE ROW triggers in alphabetical order by
-- trigger name. "guard_contractor_billing" sorts before "guard_plan_update",
-- so the silent revert always ran first on every UPDATE and reset
-- plan/stripe_customer_id/stripe_subscription_id back to OLD before
-- guard_plan_update's IS DISTINCT FROM check ever saw a difference. Its
-- RAISE EXCEPTION was permanently unreachable in both branches: reverted-
-- to-equal for any authenticated caller, and its own auth.uid() IS NOT NULL
-- guard false for service-role. Every direct client write to these columns
-- has returned error: null and silently done nothing, since whichever
-- point these triggers were added (no migration recorded either one).
--
-- The block itself is intentional and correct — plan/billing must go
-- through the system, not a bare client update — independently expressed
-- by both triggers' logic and messages, and it stays. Only the silence
-- was the bug. This migration keeps the block, makes it raise instead of
-- hide, and removes the now fully-redundant, unreachable second trigger.
-- Service-role behavior (auth.uid() IS NULL) is unchanged — those writes
-- still pass through untouched, so the admin panel's plan dropdown keeps
-- working exactly as before.
--
-- NOT FINAL — SUPERSEDED SAME DAY. The protect_contractor_billing_fields()
-- body below (the version this migration actually applies) unconditionally
-- blocks every authenticated write to plan/stripe_customer_id/
-- stripe_subscription_id, full stop. Ten minutes later,
-- 20260920230701_scope_bypass_protection_and_admin_plan_rpc.sql replaced
-- this same function again to add a current_setting('app.bypass_protection',
-- true) scope check, so the new admin_update_contractor_plan() RPC
-- (introduced in that migration, called by an authenticated admin, not
-- service-role) could legitimately update plan by setting that scope first.
-- The live, current function is the one in that later file, not this one.
-- This file is kept as an accurate record of what actually ran at the time;
-- it is not a description of the function's current behavior.
-- ============================================================================

drop trigger if exists guard_plan_update on public.contractors;
drop function if exists public.prevent_plan_self_update();

create or replace function public.protect_contractor_billing_fields()
returns trigger
language plpgsql
security definer
as $function$
begin
  -- auth.uid() is NULL when called by service_role → allow those writes through
  if auth.uid() is not null then
    if new.plan is distinct from old.plan
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    then
      -- Custom SQLSTATE (not one of the 42501s already raised elsewhere on
      -- this table by protect_contractor_columns/restrict_contractor_availability/
      -- enforce_portfolio_limit) so a client can match on error.code === 'TE001'
      -- specifically for "plan/billing must go through the system", without
      -- parsing the message text or confusing it with an unrelated 42501.
      raise exception 'Plan and billing fields can only be updated by the system'
        using errcode = 'TE001';
    end if;
  end if;
  return new;
end;
$function$;
