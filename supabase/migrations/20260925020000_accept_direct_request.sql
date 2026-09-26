-- ============================================================================
-- Accepting a direct request.
--
-- _finalize_job_acceptance()'s existing guard assumes contractor_id starts
-- NULL and gets set on acceptance (the open-job/instant-book model):
--
--   IF v_booking.status != 'pending' OR v_booking.contractor_id IS NOT NULL THEN
--     RAISE EXCEPTION 'Job already taken' ...
--
-- A direct request has contractor_id set from creation, not on acceptance --
-- calling this unmodified would always hit "Job already taken" for the
-- contractor it was actually meant for. Loosened to allow the case where
-- the booking is already reserved for the SAME contractor calling this;
-- still blocks a different contractor claiming an open job or someone
-- else's direct request.
--
-- Known gap, not fixed here: notify_job_accepted() only fires when
-- `NEW.contractor_id IS NOT NULL AND OLD.contractor_id IS NULL` -- true for
-- every existing acceptance path, false for a direct request (contractor_id
-- was already set). Accepting a direct request will correctly confirm the
-- booking and create the work order, but won't fire the normal
-- job_accepted/contractor_assigned notifications. Backlog.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._finalize_job_acceptance(p_booking_id uuid, p_contractor_id uuid, p_contractor_name text, p_final_price numeric, p_offer_id uuid DEFAULT NULL::uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_booking_time text DEFAULT NULL::text)
 RETURNS TABLE(booking bookings, work_order work_orders)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_existing_wo public.work_orders;
  v_work_order public.work_orders;
  v_verification_status text;
BEGIN
  SELECT verification_status INTO v_verification_status
  FROM public.contractors WHERE id = p_contractor_id;

  IF v_verification_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Contractor is not verified' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status != 'pending' OR (v_booking.contractor_id IS NOT NULL AND v_booking.contractor_id != p_contractor_id) THEN
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

-- accept_direct_request(): like accept_job(), but for a targeted direct
-- request instead of an instant-book open job -- checks request_mode =
-- 'direct' and that the booking is actually reserved for this contractor,
-- instead of is_instant_book.
CREATE OR REPLACE FUNCTION public.accept_direct_request(p_booking_id uuid, p_contractor_name text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_is_owner boolean;
  v_is_authorized_employee boolean;
  v_result RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
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
    RAISE EXCEPTION 'Not authorized to accept jobs for this contractor' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_result FROM public._finalize_job_acceptance(
    p_booking_id, v_booking.contractor_id, p_contractor_name, NULL, NULL, NULL, NULL
  );

  RETURN v_result.booking;
END;
$function$;
