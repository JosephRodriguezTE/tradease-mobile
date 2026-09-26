-- ============================================================================
-- notify_job_accepted() AND email_on_job_accepted() both fired on ANY
-- contractor_id NULL -> set transition, with no status check at all.
-- Caught by end-to-end proof testing: the new find-contractor "attach
-- contractor to draft" step (contractor_id set on a still status:'draft'
-- row, before the job card is even submitted) tripped this exact
-- condition in both functions -- sending a real "Job Accepted ✅" /
-- "Contractor On the Way 🔧" notification pair AND real
-- job_accepted_customer/job_accepted_contractor emails to both parties,
-- for a job that hadn't been requested yet, let alone accepted.
--
-- The only legitimate way contractor_id transitions from NULL is
-- _finalize_job_acceptance(), which always sets status = 'confirmed' in the
-- same update. Requiring that here ties both side effects to an actual
-- acceptance instead of "contractor_id merely became non-null."
--
-- Known, already-disclosed gap this does NOT touch: a direct request's
-- contractor_id is set before acceptance (not on it), so
-- OLD.contractor_id IS NULL is already false by the time
-- accept_direct_request() runs -- neither trigger fires for that path
-- either way. See the accept_direct_request migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_job_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NOT NULL AND OLD.contractor_id IS NULL AND NEW.status = 'confirmed' THEN
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
  IF NEW.contractor_id IS NOT NULL AND OLD.contractor_id IS NULL AND NEW.status = 'confirmed' THEN

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
