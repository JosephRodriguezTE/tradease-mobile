-- ============================================================================
-- Direct request flow: targeted booking notifications, decline + repost-
-- publicly fallback.
--
-- Adds a customer-targeted alternative to the existing broadcast-to-everyone
-- new-job notification: a booking with contractor_id set (or, defensively,
-- request_mode = 'direct' alone) notifies only that one contractor (type:
-- direct_request), instead of every nearby matching contractor.
--
-- Also closes a gap the draft-as-carrier flow depends on: on_new_job_posted,
-- trg_email_new_job_posted, and trg_broadcast_new_job_lead are all
-- AFTER INSERT only. Promoting a draft row (status: 'draft' -> 'pending')
-- is an UPDATE, so none of them fire for a resumed draft today -- a plain
-- "Post Job" reached by resuming a real saved draft already silently
-- notifies nobody, pre-existing and unrelated to this feature. This
-- migration adds an AFTER UPDATE companion trigger for notify_new_job_posted
-- specifically (needed for both the direct-request and public-post draft
-- promotion paths). email_on_new_job_posted and broadcast_new_job_lead have
-- the identical gap and are NOT fixed here -- backlog, don't fix.
-- ============================================================================

-- 1. notify_new_job_posted(): targeted branch for contractor_id / request_mode = 'direct'
CREATE OR REPLACE FUNCTION public.notify_new_job_posted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Targeted at one contractor -- either explicitly (contractor_id set, the
  -- "Request {company_name}" flow) or via request_mode = 'direct' alone as
  -- a defensive check. Notifies only that contractor, with its own type so
  -- it's visibly different from an open lead, instead of broadcasting.
  IF NEW.status = 'pending' AND (NEW.contractor_id IS NOT NULL OR NEW.request_mode = 'direct') THEN
    IF NEW.contractor_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      VALUES (
        NEW.contractor_id, 'direct_request',
        '📩 ' || COALESCE(NEW.customer_name, 'A customer') || ' requested you',
        COALESCE(NEW.trade, 'Job') || ' — ' ||
          CASE WHEN NEW.price_estimate IS NOT NULL THEN 'Est. $' || NEW.price_estimate::TEXT ELSE 'Price TBD' END,
        jsonb_build_object('booking_id', NEW.id, 'trade', NEW.trade),
        'person-outline', NEW.customer_name
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.contractor_id IS NULL AND NEW.status = 'pending' THEN
    IF NEW.job_lat IS NOT NULL AND NEW.job_lng IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT n.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — ' ||
          CASE WHEN NEW.price_estimate IS NOT NULL THEN 'Est. $' || NEW.price_estimate::TEXT ELSE 'Price TBD' END,
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_nearby(NEW.job_lat::float8, NEW.job_lng::float8, 50, NEW.trade, NULL) n;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT c.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — ' ||
          CASE WHEN NEW.price_estimate IS NOT NULL THEN 'Est. $' || NEW.price_estimate::TEXT ELSE 'Price TBD' END,
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_public c
      WHERE c.is_available = true
        AND c.verification_status = 'approved'
        AND c.profile_published = true
        AND (NEW.trade IS NULL OR EXISTS (
          SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = NEW.trade
        ));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Companion trigger: fire the same function when a draft (or a declined
-- direct request being reposted publicly) transitions into 'pending'. Both
-- outcomes land on status = 'pending' -- the branch above already tells
-- them apart by contractor_id/request_mode.
DROP TRIGGER IF EXISTS on_booking_pending_transition ON public.bookings;
CREATE TRIGGER on_booking_pending_transition
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IN ('draft', 'declined') AND NEW.status = 'pending')
EXECUTE FUNCTION notify_new_job_posted();

-- 3. handle_cancellation_and_reassign(): a contractor declining a still-
-- pending direct request is not a cancellation/reassignment event -- the
-- booking was never accepted, there's nothing to reassign, and
-- decline_direct_request() below sends its own notification
-- (direct_request_declined, naming the contractor) rather than this
-- function's generic "we're finding you a new contractor" copy, which
-- would be misleading here since nothing automatic happens -- the customer
-- has to choose to repost. Distinguished from a real cancellation by
-- requiring request_mode = 'direct' and the row was still 'pending' going
-- in; an accepted/confirmed booking is never 'pending' by the time it's
-- cancelled.
CREATE OR REPLACE FUNCTION public.handle_cancellation_and_reassign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hours   numeric;
  v_rule    record;
  v_fee_pct int := 0;
  v_label   text := 'Free';
  v_by      text;
begin
  if new.status not in ('declined','cancelled') then return new; end if;
  if old.status = new.status then return new; end if;
  if old.request_mode = 'direct' and old.status = 'pending' and new.status = 'declined' then
    return new;
  end if;

  -- Determine who cancelled
  v_by := coalesce(new.cancelled_by,
    case when new.status = 'declined' then 'contractor' else 'customer' end);

  -- Calculate hours until booking
  if new.booking_date is not null then
    v_hours := extract(epoch from (
      (new.booking_date::timestamp + coalesce(new.booking_time, '09:00')::time) - now()
    )) / 3600.0;
  else
    v_hours := 999;
  end if;

  -- Customer cancellation = fee; contractor cancellation = no fee to customer
  if v_by = 'customer' then
    select * into v_rule from public.cancellation_rules
    where hours_before <= greatest(v_hours, 0)
    order by hours_before desc limit 1;
    if found then
      v_fee_pct := v_rule.fee_percent;
      v_label   := v_rule.label;
    end if;
  end if;

  -- Log cancellation -- reassign_needed removed, does not exist on this table
  insert into public.cancellations
    (booking_id, cancelled_by, hours_before, fee_percent, rule_applied, refund_status)
  values (
    new.id, v_by,
    round(v_hours::numeric, 1),
    v_fee_pct, v_label,
    case when v_fee_pct = 0 then 'na' else 'pending' end
  );

  -- Update booking fee fields
  new.cancelled_at    := now();
  new.fee_applied     := v_fee_pct > 0;
  new.fee_percent     := v_fee_pct;
  new.cancelled_by    := v_by;

  -- Notify the other party -- only if there is one
  if v_by = 'contractor' then
    insert into public.notifications (user_id, message, type, booking_id)
    values (
      new.customer_id,
      '⚠️ ' || coalesce(new.contractor_name, 'Your contractor') ||
      ' cancelled your booking. We are finding you a new contractor — check your bookings.',
      'booking_cancelled',
      new.id
    );
  elsif new.contractor_id is not null then
    insert into public.notifications (user_id, message, type, booking_id)
    values (
      new.contractor_id::uuid,
      '❌ ' || coalesce(new.customer_name, 'A customer') ||
      ' cancelled their booking request.',
      'booking_cancelled_contractor',
      new.id
    );
  end if;

  return new;
end;
$function$;

-- 4. notify_booking_status_supplemental(): same reasoning -- a direct
-- request decline gets its own notification from decline_direct_request(),
-- not this function's generic job_declined one.
CREATE OR REPLACE FUNCTION public.notify_booking_status_supplemental()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- Contractor started the job → notify customer
  IF NEW.status = 'in_progress' AND NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.customer_id,
      'job_in_progress',
      '🔧 Work Has Started',
      COALESCE(NEW.contractor_name, 'Your contractor') || ' has started your '
        || COALESCE(NEW.trade, 'job') || '. You''ll be notified when it''s done.',
      jsonb_build_object('booking_id', NEW.id),
      'construct-outline',
      NEW.contractor_name
    );

  -- Customer cancelled → notify the assigned contractor
  ELSIF NEW.status = 'cancelled'
    AND NEW.contractor_id IS NOT NULL
    AND COALESCE(NEW.cancelled_by, '') = 'customer' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.contractor_id,
      'job_cancelled',
      '⚠️ Booking Cancelled',
      COALESCE(NEW.customer_name, 'The customer') || ' cancelled the '
        || COALESCE(NEW.trade, 'job') || ' booking.',
      jsonb_build_object('booking_id', NEW.id),
      'close-circle-outline',
      NEW.customer_name
    );

  -- Contractor declined an open job → notify customer. Direct-request
  -- declines are excluded -- decline_direct_request() sends its own
  -- direct_request_declined notification instead.
  ELSIF NEW.status = 'declined' AND NEW.customer_id IS NOT NULL AND NEW.request_mode IS DISTINCT FROM 'direct' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.customer_id,
      'job_declined',
      '❌ Booking Declined',
      COALESCE(NEW.contractor_name, 'A contractor') || ' declined your '
        || COALESCE(NEW.trade, 'job') || ' request. Try another contractor.',
      jsonb_build_object('booking_id', NEW.id),
      'close-circle-outline',
      NEW.contractor_name
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. restrict_booking_update(): two narrow exceptions for the direct-request
-- flow (see inline comments).
CREATE OR REPLACE FUNCTION public.restrict_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
-- Contractor cannot reassign customer, reassign contractor, or revert to pending
IF auth.uid() = OLD.contractor_id THEN
IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
RAISE EXCEPTION 'Cannot change customer on a booking';
END IF;
IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
RAISE EXCEPTION 'Cannot reassign contractor';
END IF;
IF NEW.status = 'pending' AND OLD.status != 'pending' THEN
RAISE EXCEPTION 'Cannot revert booking to pending';
END IF;
END IF;
-- Customer cannot reassign an existing contractor, cannot assign a
-- contractor with no matching offer, and cannot steal back a confirmed job.
-- Two exceptions for the direct-request flow: assigning a contractor
-- (NULL -> some id) with no job_offers row is allowed when
-- request_mode = 'direct' -- that IS the point of a direct request, not
-- tampering with the quote-matched path. Clearing it (some id -> NULL) is
-- allowed only under app.bypass_protection = 'direct_decline_repost',
-- which repost_declined_request_publicly() sets right before this specific
-- update, after independently verifying status = 'declined' and
-- request_mode = 'direct' itself -- narrower than "any customer update."
IF auth.uid() = OLD.customer_id THEN
IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
IF OLD.contractor_id IS NOT NULL THEN
IF current_setting('app.bypass_protection', true) IS DISTINCT FROM 'direct_decline_repost' THEN
RAISE EXCEPTION 'Cannot change contractor on a booking';
END IF;
ELSIF NEW.contractor_id IS NOT NULL
  AND NEW.request_mode IS DISTINCT FROM 'direct'
  AND NOT EXISTS (
  SELECT 1 FROM public.job_offers
  WHERE booking_id = OLD.id AND contractor_id = NEW.contractor_id
) THEN
RAISE EXCEPTION 'Cannot assign a contractor without a matching offer';
END IF;
END IF;
IF OLD.status IN ('accepted','confirmed','in_progress') AND NEW.status = 'pending' THEN
RAISE EXCEPTION 'Cannot revert an active booking to pending';
END IF;
END IF;
RETURN NEW;
END;
$function$;

-- 6. decline_direct_request(): contractor-side decline for a targeted
-- request. Sets status = 'declined' and notifies only the customer, with
-- its own type (direct_request_declined) carrying the contractor's name so
-- the client can render the "Post publicly instead" action.
CREATE OR REPLACE FUNCTION public.decline_direct_request(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_is_owner boolean;
  v_is_authorized_employee boolean;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.contractor_id IS NULL OR v_booking.request_mode IS DISTINCT FROM 'direct' THEN
    RAISE EXCEPTION 'Not a direct request' USING ERRCODE = 'P0001';
  END IF;

  v_is_owner := (auth.uid() = v_booking.contractor_id);
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE auth_user_id = auth.uid() AND company_id = v_booking.contractor_id AND can_accept_jobs = true
  ) OR EXISTS (
    SELECT 1 FROM public.contractor_employees
    WHERE user_id = auth.uid() AND contractor_id = v_booking.contractor_id
      AND status = 'active' AND can_accept_jobs = true
  ) INTO v_is_authorized_employee;

  IF NOT (v_is_owner OR v_is_authorized_employee) THEN
    RAISE EXCEPTION 'Not authorized to decline this request' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings SET status = 'declined' WHERE id = p_booking_id;

  INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
  VALUES (
    v_booking.customer_id, 'direct_request_declined',
    COALESCE(v_booking.contractor_name, 'The contractor') || ' declined your request',
    COALESCE(v_booking.trade, 'Your job') || ' — you can post it publicly to reach other contractors nearby.',
    jsonb_build_object('booking_id', v_booking.id, 'trade', v_booking.trade, 'contractor_name', v_booking.contractor_name),
    'close-circle-outline', v_booking.contractor_name
  );
END;
$function$;

-- 7. repost_declined_request_publicly(): the "Post publicly instead" action.
-- Customer-only, verifies the booking is actually a declined direct request
-- before touching anything, then clears the contractor and reopens it as a
-- normal public post -- on_booking_pending_transition (item 2) fires
-- notify_new_job_posted() on this same update, which broadcasts it since
-- contractor_id is now null.
CREATE OR REPLACE FUNCTION public.repost_declined_request_publicly(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() <> v_booking.customer_id THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status <> 'declined' OR v_booking.request_mode IS DISTINCT FROM 'direct' THEN
    RAISE EXCEPTION 'This request cannot be reposted publicly' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.bypass_protection', 'direct_decline_repost', true);

  UPDATE public.bookings
  SET contractor_id       = NULL,
      contractor_name     = NULL,
      request_mode        = 'post',
      is_public           = true,
      status              = 'pending',
      request_expires_at  = now() + interval '48 hours'
  WHERE id = p_booking_id;
END;
$function$;
