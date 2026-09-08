-- Found while migrating path C (customer accepting a quote): the current
-- client code carries offer.scheduled_at/offer.booking_time onto the
-- booking on acceptance (set when a contractor submits a quote or
-- counter with a proposed time -- contractor-home.tsx's submit_quote
-- insert and respondToCounter's bookingUpdates both touch these). The
-- RPC layer built for accept_job_v2 didn't account for this at all --
-- migrating without it would silently drop live functionality. Adding
-- two optional, trailing params so accept_job's call site (direct/
-- instant-book, no offer, no scheduling) doesn't need to change at all.
-- Uses COALESCE against the current value, matching the old client
-- code's `if (offer.scheduled_at) bookingUpdates.scheduled_at = ...`
-- semantics exactly: only overwrites when a real value is supplied,
-- never clears an existing one.
--
-- NOTE: the first attempt at this used CREATE OR REPLACE with the new
-- params, which created a second overload instead of replacing the
-- original (Postgres only replaces a function with an identical
-- argument signature) -- caught immediately via
-- has_function_privilege() and a duplicate-overload query, fixed by
-- dropping the old 5-arg version below so exactly one shared function
-- exists, matching the design.
CREATE OR REPLACE FUNCTION public._finalize_job_acceptance(
  p_booking_id uuid,
  p_contractor_id uuid,
  p_contractor_name text,
  p_final_price numeric,
  p_offer_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_booking_time text DEFAULT NULL
)
RETURNS TABLE(booking public.bookings, work_order public.work_orders)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_existing_wo public.work_orders;
  v_work_order public.work_orders;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status != 'pending' OR v_booking.contractor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job already taken' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
  SET contractor_id   = p_contractor_id,
      contractor_name = p_contractor_name,
      status          = 'confirmed',
      price_estimate  = COALESCE(p_final_price, price_estimate),
      scheduled_at    = COALESCE(p_scheduled_at, scheduled_at),
      booking_time    = COALESCE(p_booking_time, booking_time),
      accepted_at     = NOW(),
      confirmed_at    = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF p_offer_id IS NOT NULL THEN
    UPDATE public.job_offers
    SET status            = 'accepted',
        customer_action   = 'accepted',
        contractor_final  = 'accepted',
        final_price       = COALESCE(p_final_price, final_price)
    WHERE id = p_offer_id;
  END IF;

  SELECT * INTO v_existing_wo FROM public.work_orders WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_existing_wo IS NULL THEN
    INSERT INTO public.work_orders (
      booking_id, contractor_id, customer_id, contractor_name, customer_name,
      service_type, job_address, status, wo_status
    )
    VALUES (
      p_booking_id, p_contractor_id, v_booking.customer_id, p_contractor_name,
      COALESCE(v_booking.customer_name, ''),
      v_booking.trade, COALESCE(v_booking.job_address, v_booking.notes, ''),
      'accepted', 'accepted'
    )
    RETURNING * INTO v_work_order;
  ELSE
    v_work_order := v_existing_wo;
  END IF;

  RETURN QUERY SELECT v_booking, v_work_order;
END;
$function$;

DROP FUNCTION IF EXISTS public._finalize_job_acceptance(uuid, uuid, text, numeric, uuid);

REVOKE EXECUTE ON FUNCTION public._finalize_job_acceptance(uuid, uuid, text, numeric, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- accept_job: now calls the 7-arg _finalize_job_acceptance, passing
-- NULL for scheduling (instant-book/direct-accept has no offer and
-- never set these). Everything else unchanged.
CREATE OR REPLACE FUNCTION public.accept_job(p_booking_id uuid, p_contractor_id uuid, p_contractor_name text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner BOOLEAN;
  v_is_authorized_employee BOOLEAN;
  v_is_instant_book BOOLEAN;
  v_result RECORD;
BEGIN
  v_is_owner := (auth.uid() = p_contractor_id);

  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE auth_user_id = auth.uid() AND company_id = p_contractor_id AND can_accept_jobs = true
  ) OR EXISTS (
    SELECT 1 FROM public.contractor_employees
    WHERE user_id = auth.uid() AND contractor_id = p_contractor_id
      AND status = 'active' AND can_accept_jobs = true
  ) INTO v_is_authorized_employee;

  IF NOT (v_is_owner OR v_is_authorized_employee) THEN
    RAISE EXCEPTION 'Not authorized to accept jobs for this contractor' USING ERRCODE = '42501';
  END IF;

  SELECT is_instant_book INTO v_is_instant_book FROM public.bookings WHERE id = p_booking_id;
  IF v_is_instant_book IS NOT TRUE THEN
    RAISE EXCEPTION 'This job requires a quote' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_result FROM public._finalize_job_acceptance(p_booking_id, p_contractor_id, p_contractor_name, NULL, NULL, NULL, NULL);

  RETURN v_result.booking;
END;
$function$;

-- customer_respond_offer: accepted branch now also passes the offer's
-- own scheduled_at/booking_time through. Everything else unchanged.
CREATE OR REPLACE FUNCTION public.customer_respond_offer(p_offer_id uuid, p_action text, p_counter_price numeric DEFAULT NULL::numeric, p_counter_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer job_offers%ROWTYPE;
  v_contractor_name text;
  v_result RECORD;
BEGIN
  SELECT * INTO v_offer FROM job_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM bookings WHERE id = v_offer.booking_id AND customer_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_offer.status != 'quoted' OR v_offer.customer_action != 'pending' THEN
    RAISE EXCEPTION 'Offer is no longer available for response';
  END IF;
  IF v_offer.expires_at < NOW() THEN
    UPDATE job_offers SET status = 'expired' WHERE id = p_offer_id;
    RAISE EXCEPTION 'This offer has expired';
  END IF;
  IF p_action = 'accepted' THEN
    SELECT company_name INTO v_contractor_name FROM public.contractors WHERE id = v_offer.contractor_id;
    SELECT * INTO v_result FROM public._finalize_job_acceptance(
      v_offer.booking_id, v_offer.contractor_id, COALESCE(v_contractor_name, ''), v_offer.quoted_price, p_offer_id,
      v_offer.scheduled_at, v_offer.booking_time
    );
  ELSIF p_action = 'declined' THEN
    UPDATE job_offers SET customer_action = 'declined', status = 'declined' WHERE id = p_offer_id;
  ELSIF p_action = 'countered' THEN
    IF p_counter_price IS NULL THEN RAISE EXCEPTION 'Counter price is required'; END IF;
    IF p_counter_price < v_offer.quoted_price * 0.70 THEN
      RAISE EXCEPTION 'Counter must be at least 70%% of the quoted price ($%)',
        ROUND((v_offer.quoted_price * 0.70)::numeric, 2);
    END IF;
    UPDATE job_offers SET
      customer_action = 'countered', counter_price = p_counter_price,
      counter_note = p_counter_note, status = 'countered',
      counter_expires_at = NOW() + INTERVAL '2 hours'
    WHERE id = p_offer_id;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$function$;

-- contractor_respond_counter: same addition to the accepted branch.
CREATE OR REPLACE FUNCTION public.contractor_respond_counter(p_offer_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer job_offers%ROWTYPE;
  v_contractor_name text;
  v_result RECORD;
BEGIN
  SELECT * INTO v_offer FROM job_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.contractor_id != auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_offer.status != 'countered' THEN RAISE EXCEPTION 'No active counter to respond to'; END IF;
  IF v_offer.counter_expires_at IS NOT NULL AND v_offer.counter_expires_at < NOW() THEN
    UPDATE job_offers SET status = 'expired' WHERE id = p_offer_id;
    RAISE EXCEPTION 'The counter offer has expired';
  END IF;
  IF p_action = 'accepted' THEN
    SELECT company_name INTO v_contractor_name FROM public.contractors WHERE id = v_offer.contractor_id;
    SELECT * INTO v_result FROM public._finalize_job_acceptance(
      v_offer.booking_id, v_offer.contractor_id, COALESCE(v_contractor_name, ''), v_offer.counter_price, p_offer_id,
      v_offer.scheduled_at, v_offer.booking_time
    );
  ELSIF p_action = 'declined' THEN
    UPDATE job_offers SET contractor_final = 'declined', status = 'declined' WHERE id = p_offer_id;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$function$;
