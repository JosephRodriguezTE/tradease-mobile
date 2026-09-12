-- Confirmed before writing this: three code paths write
-- contractors.is_available/is_online (contractor-home.tsx's
-- toggleOnline, app/(tabs)/index.tsx's toggleAvailable, and
-- work-order/contractor.tsx, which writes a *different* table --
-- contractor_locations -- and is unaffected by this), and none of them
-- checked verification_status. Neither did the contractors UPDATE RLS
-- policy (auth.uid() = id, no verification clause).
--
-- Only blocks the true case -- going offline is never restricted,
-- regardless of verification status. Client-side checks in both
-- toggles land in a separate commit.
CREATE OR REPLACE FUNCTION public.restrict_contractor_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.is_available = true OR NEW.is_online = true)
     AND NEW.verification_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Cannot go online until verification is approved' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_restrict_contractor_availability ON public.contractors;
CREATE TRIGGER trg_restrict_contractor_availability
BEFORE UPDATE ON public.contractors
FOR EACH ROW
EXECUTE FUNCTION public.restrict_contractor_availability();

-- New function got the same default-privileges anon/PUBLIC grant every
-- new function in this project has gotten (checked
-- information_schema.routine_privileges immediately after, per the
-- established habit). This one returns `trigger`, which Postgres
-- refuses to invoke outside an actual trigger context regardless of
-- grants -- SELECT restrict_contractor_availability() fails with a type
-- error either way -- so it was never actually callable. Revoked
-- anyway: an unintentional grant sitting on a function is drift whether
-- or not it happens to be exploitable today. Confirmed afterward, via a
-- real UPDATE as the authenticated test contractor, that revoking
-- EXECUTE from anon/authenticated/PUBLIC does not stop the trigger from
-- firing -- trigger invocation isn't gated by EXECUTE the way a direct
-- RPC call is.
REVOKE ALL ON FUNCTION public.restrict_contractor_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restrict_contractor_availability() FROM anon;
REVOKE ALL ON FUNCTION public.restrict_contractor_availability() FROM authenticated;

-- Companion fix, per explicit decision after asking: force offline on
-- rejection rather than leaving an already-online contractor's
-- is_available/is_online stale until they happen to toggle it
-- themselves. Nothing previously set these on rejection -- confirmed by
-- reading the prior definition and by checking every trigger and
-- function that mentions verification_status or insurance_expiry
-- (there are none for the latter at all -- expiry is captured at
-- submission and never checked again; a separate, larger gap, not
-- addressed here).
--
-- Approving leaves both columns untouched (case ... else
-- is_available/is_online end) -- approval shouldn't silently flip
-- someone online; they still have to toggle it on themselves.
CREATE OR REPLACE FUNCTION public.admin_review_verification(p_contractor_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_admin = true) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform set_config('app.bypass_protection', 'true', true);  -- allow verified/license/insurance writes
  update public.contractors set
    verification_status           = case when p_approve then 'approved' else 'rejected' end,
    approval_status                = case when p_approve then 'approved' else 'rejected' end,
    verified                       = p_approve,
    license_verified                = case when p_approve then true else license_verified end,
    insurance_verified              = case when p_approve then true else insurance_verified end,
    insured                         = case when p_approve then true else insured end,
    verification_rejection_reason  = case when p_approve then null else p_reason end,
    verification_reviewed_at       = now(),
    is_available                    = case when p_approve then is_available else false end,
    is_online                       = case when p_approve then is_online else false end
  where id = p_contractor_id;
  update public.contractor_verification
    set status = case when p_approve then 'approved' else 'rejected' end
  where contractor_id = p_contractor_id;
end $function$;
