-- The security hole from the verification audit: accept_job,
-- customer_respond_offer, and contractor_respond_counter all delegate
-- their "accepted" branch to _finalize_job_acceptance, and none of the
-- four checked verification_status anywhere -- confirmed by reading all
-- four live definitions before touching anything. The only check was a
-- client-side Alert shown before the app called the RPC, so calling
-- accept_job directly with a valid session and a valid instant-book job
-- succeeded regardless of verification status.
--
-- Fixed at this one choke point rather than in three separate wrappers,
-- for the same reason this function exists at all: one place that can't
-- drift, instead of three that already had.
--
-- Proved directly against the live database, not inferred: temporarily
-- flipped a real contractor to pending_review inside a transaction,
-- inserted a real instant-book job, called accept_job as that
-- contractor's own session -- got back
-- `42501: Contractor is not verified`, raised from inside
-- _finalize_job_acceptance. Rolled back (verification_status and the
-- test job both confirmed reverted, zero rows left over). Then ran the
-- same call as a genuinely approved contractor as a regression check --
-- succeeded normally (status='confirmed', contractor_id set) -- also
-- rolled back.
--
-- Grants checked immediately after via information_schema.
-- routine_privileges, same as the last three times a function got
-- recreated: unaffected, since this is a same-signature CREATE OR
-- REPLACE (not a DROP+CREATE, which is what triggered the anon leak
-- previously) -- only postgres and service_role have EXECUTE, matching
-- before.
CREATE OR REPLACE FUNCTION public._finalize_job_acceptance(
  p_booking_id uuid,
  p_contractor_id uuid,
  p_contractor_name text,
  p_final_price numeric,
  p_offer_id uuid DEFAULT NULL::uuid,
  p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_booking_time text DEFAULT NULL::text
)
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
