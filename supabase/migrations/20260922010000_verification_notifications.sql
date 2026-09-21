-- admin_review_verification() previously only updated contractors and
-- contractor_verification -- no notification of any kind, to the
-- contractor or to admins. Adds two inserts, through the normal
-- public.notifications path (not a bespoke call), so
-- trigger_send_push_notification fires exactly the way it does for every
-- other notification type: contractor gets verification_approved or
-- verification_rejected (with the reason folded into the message when
-- rejected), and every is_admin user gets the same type naming the
-- contractor. Both types are in send-push-notification's
-- NEVER_SUPPRESSIBLE set already (deployed ahead of this migration) --
-- account status that gates going online shouldn't be quietly muted by a
-- pref.
--
-- Not wrapped in an exception-swallowing block the way the change-order
-- trigger functions wrap their notification inserts -- those are
-- incidental side effects of an unrelated primary action; here the
-- notification *is* part of what this action is for, so a failure should
-- roll back and surface, not vanish silently.

CREATE OR REPLACE FUNCTION public.admin_review_verification(p_contractor_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_name text;
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
  where id = p_contractor_id
  returning company_name into v_company_name;

  update public.contractor_verification
    set status = case when p_approve then 'approved' else 'rejected' end
  where contractor_id = p_contractor_id;

  -- Notify the contractor
  insert into public.notifications (user_id, type, title, message, data)
  values (
    p_contractor_id,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    case when p_approve then 'Verification Approved ✅' else 'Verification Rejected' end,
    case when p_approve
      then 'Your contractor verification has been approved. You can now go online and accept jobs.'
      else 'Your contractor verification was rejected. Reason: ' || coalesce(p_reason, 'No reason provided.')
    end,
    jsonb_build_object('contractor_id', p_contractor_id, 'approved', p_approve, 'reason', p_reason)
  );

  -- Notify every admin
  insert into public.notifications (user_id, type, title, message, data)
  select
    u.id,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    case when p_approve then 'Contractor Verified' else 'Contractor Verification Rejected' end,
    coalesce(v_company_name, 'A contractor') || ' (' || p_contractor_id::text || ')' ||
      case when p_approve then ' was approved.'
           else ' was rejected. Reason: ' || coalesce(p_reason, 'No reason provided.')
      end,
    jsonb_build_object('contractor_id', p_contractor_id, 'approved', p_approve, 'reason', p_reason)
  from public.users u
  where u.is_admin = true;
end $function$;
