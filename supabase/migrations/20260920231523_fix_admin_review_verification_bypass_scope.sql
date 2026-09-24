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
  perform set_config('app.bypass_protection', 'verification', true);  -- allow verified/license/insurance writes
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