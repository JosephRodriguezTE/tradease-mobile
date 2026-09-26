-- ============================================================================
-- notify_job_accepted() and email_on_job_accepted() never fired for a
-- direct-request acceptance: both guarded on
-- `NEW.contractor_id IS NOT NULL AND OLD.contractor_id IS NULL`, which
-- assumes contractor_id transitions from null AT acceptance time -- true
-- for the open-job/instant-book model, false for a direct request, whose
-- contractor_id is set at creation, not on accept. accept_direct_request()
-- calls _finalize_job_acceptance() with the SAME contractor_id the row
-- already had, so OLD.contractor_id IS NULL is always false for that path.
-- Accepting a direct request confirmed the booking and created the work
-- order correctly, but notified the customer of nothing.
--
-- Verified there's a cleaner, exclusive signal: `status = 'confirmed'` is
-- written in exactly one place in this entire schema --
-- _finalize_job_acceptance()'s own UPDATE. Every other mention of
-- 'confirmed' anywhere (a CHECK constraint, two RLS policies, a view,
-- restrict_booking_update()'s own guard) only reads it. So the status
-- transition into 'confirmed' identifies "this row was just accepted"
-- regardless of which caller got there or what contractor_id was
-- beforehand -- covering both the normal and direct-request paths with one
-- condition, with no need to special-case either.
--
-- Still silent for the case this guard exists to prevent: attaching a
-- contractor to a still-draft row (find-contractor's attach-on-select)
-- never touches status at all -- it stays 'draft' -- so
-- NEW.status = 'confirmed' is false there regardless of what contractor_id
-- does.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_job_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NOT NULL AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.contractor_id, 'job_accepted', 'Job Accepted ✅',
      'You accepted a ' || COALESCE(NEW.trade,'job') || ' in ' || COALESCE(NEW.job_address,'your area'),
      jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
      'checkmark-circle-outline', NEW.customer_name
    );
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.customer_id, 'contractor_assigned', 'Contractor On the Way 🔧',
      COALESCE(NEW.contractor_name,'Your contractor') || ' accepted your ' || COALESCE(NEW.trade,'job') || ' request',
      jsonb_build_object('booking_id',NEW.id,'contractor_id',NEW.contractor_id),
      'construct-outline', NEW.contractor_name
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_on_job_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_customer_email TEXT;
  v_contractor_email TEXT;
BEGIN
  IF NEW.contractor_id IS NOT NULL AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN

    SELECT email INTO v_customer_email FROM public.users WHERE id = NEW.customer_id;
    SELECT email INTO v_contractor_email FROM public.users WHERE id = NEW.contractor_id;

    PERFORM public.send_email('job_accepted_customer', v_customer_email, jsonb_build_object(
      'contractorName', COALESCE(NEW.contractor_name,'Your contractor'),
      'trade', COALESCE(NEW.trade,'service'),
      'address', COALESCE(NEW.job_address,'your address'),
      'priceEstimate', '$' || COALESCE(NEW.price_estimate::TEXT,'TBD')
    ));

    PERFORM public.send_email('job_accepted_contractor', v_contractor_email, jsonb_build_object(
      'customerName', COALESCE(NEW.customer_name,'Customer'),
      'trade', COALESCE(NEW.trade,'service'),
      'address', COALESCE(NEW.job_address,''),
      'priceEstimate', '$' || COALESCE(NEW.price_estimate::TEXT,'TBD')
    ));
  END IF;
  RETURN NEW;
END;
$function$;
