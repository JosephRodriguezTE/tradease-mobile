-- Same bug class as notify_new_message (see the prior migration): each of
-- these four notify_* triggers was SECURITY INVOKER, ran as whoever
-- performed the write, and tried to insert a notifications row for a
-- different party. notifications_restrict_insert requires
-- auth.uid() = user_id, which the acting party can never satisfy for
-- someone else's row -- structurally unsatisfiable, same as before.
--
-- notify_employee_invited: contractor_id (the inviter) is already
-- RLS-protected to the real company owner (owner_manage_employees:
-- auth.uid() = contractor_id). Unlike messages.recipient_id there's no
-- independent field to cross-check user_id against, and the notification's
-- only real claim ("you were invited by <company_name>") stays truthful
-- regardless of who user_id points at -- no extra hardening needed beyond
-- the security-context fix itself.
CREATE OR REPLACE FUNCTION public.notify_employee_invited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_name TEXT;
BEGIN
  SELECT company_name INTO v_company_name
  FROM public.contractors WHERE id = NEW.contractor_id;

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon)
    VALUES (
      NEW.user_id,
      'employee_invite',
      'You have been invited to join ' || COALESCE(v_company_name, 'a company'),
      'Tap to accept your invitation and join the team on Tradease',
      jsonb_build_object('contractor_id', NEW.contractor_id, 'invite_token', NEW.invite_token),
      'people-outline'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- notify_job_accepted: NEW.contractor_id / NEW.customer_id come from
-- bookings, whose own restrict_booking_update() guard (already SECURITY
-- DEFINER) forbids a contractor from reassigning either column -- both
-- target ids are protected columns, not caller-supplied sidecar fields,
-- so no extra cross-check is needed here either.
CREATE OR REPLACE FUNCTION public.notify_job_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NOT NULL AND OLD.contractor_id IS NULL THEN
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

-- notify_job_completed: same reasoning as notify_job_accepted --
-- NEW.customer_id is the same protected column.
CREATE OR REPLACE FUNCTION public.notify_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.customer_id, 'job_completed', 'Job Complete — Review & Pay 💳',
      COALESCE(NEW.contractor_name,'Your contractor') || ' marked the job complete. Approve payment within 24 hours.',
      jsonb_build_object('booking_id',NEW.id),
      'receipt-outline', NEW.contractor_name
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- notify_new_job_posted: same security fix, plus the contractor list is
-- now derived server-side from the booking's own trade and location via
-- contractors_nearby() (the same radius/trade rule used everywhere else
-- contractors are matched), instead of fanning out to every
-- available+approved contractor regardless of relevance or distance.
-- Falls back to a trade-only match (no radius) when the booking has no
-- coordinates yet -- create-job's client-side capture is best-effort
-- (coords ?? null) and observably null for some real bookings -- rather
-- than silently notifying nobody on the product's primary lead-delivery
-- path. This trigger only fires on INSERT (unchanged); a booking that
-- starts without coordinates and gets geocoded later does not get a
-- second, more precise re-fan-out -- same limitation the pre-fix version
-- had, not a regression, just not addressed here.
CREATE OR REPLACE FUNCTION public.notify_new_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NULL AND NEW.status = 'pending' THEN
    IF NEW.job_lat IS NOT NULL AND NEW.job_lng IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT n.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — Est. $' || COALESCE(NEW.price_estimate::TEXT,'—'),
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_nearby(NEW.job_lat::float8, NEW.job_lng::float8, 50, NEW.trade, NULL) n;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT c.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — Est. $' || COALESCE(NEW.price_estimate::TEXT,'—'),
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_public c
      WHERE c.is_available = true
        AND c.verification_status = 'approved'
        AND c.profile_published = true
        AND (NEW.trade IS NULL OR c.trade_type ilike '%' || NEW.trade || '%');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
