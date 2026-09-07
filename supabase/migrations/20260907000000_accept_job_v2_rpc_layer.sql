-- accept_job_v2 design, RPC layer only (mobile call sites migrate separately).
--
-- Shared core for all job-acceptance paths. Not exposed to PostgREST --
-- callable only from the three wrapper RPCs below, which have already
-- done their own caller/precondition checks by the time they call this.
-- Locks the booking row, writes bookings + job_offers (when an offer is
-- involved) + work_orders in one transaction, and is idempotent on the
-- work order -- checked once, in-transaction, instead of the four
-- separate client upserts this is designed to replace.
CREATE OR REPLACE FUNCTION public._finalize_job_acceptance(
  p_booking_id uuid,
  p_contractor_id uuid,
  p_contractor_name text,
  p_final_price numeric,
  p_offer_id uuid DEFAULT NULL
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
  -- Lock the booking row. This alone serializes every concurrent accept
  -- attempt on this booking, regardless of which of the three wrappers
  -- (or which platform) is calling.
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

  -- work_orders.customer_name is NOT NULL; bookings.customer_name is
  -- nullable in practice -- defaulting to '' to match the existing
  -- client code's own `bookingRow.customer_name || ''` convention
  -- (found by a real test that crashed on this exact gap).
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

-- Not a public RPC -- must not be callable directly, since it trusts its
-- caller to have already authorized the request. Direct access would let
-- any authenticated client forge acceptance of any booking by id,
-- bypassing accept_job's owner check and customer_respond_offer's/
-- contractor_respond_counter's offer-ownership checks entirely. Verified
-- live: has_function_privilege('authenticated', ...) = false after this.
REVOKE EXECUTE ON FUNCTION public._finalize_job_acceptance(uuid, uuid, text, numeric, uuid) FROM PUBLIC, anon, authenticated;

-- accept_job: direct/instant-book mode. Signature unchanged. Adds the
-- is_instant_book check -- a contractor direct-accepting a regular job
-- takes it at the customer's raw estimate (a budget ceiling, not an
-- agreed price) and skips the customer's choice of contractor, which is
-- what the quote system is for. This is a real behavior change on the
-- website: its "Accept Job" button was not gated on is_instant_book at
-- all before this -- confirmed by reading ContractorJobActions.tsx and
-- its parent page, neither of which reference the field. Now delegates
-- the write to _finalize_job_acceptance instead of doing it inline,
-- which is what adds work-order creation -- accept_job never created
-- one before.
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

  SELECT * INTO v_result FROM public._finalize_job_acceptance(p_booking_id, p_contractor_id, p_contractor_name, NULL, NULL);

  RETURN v_result.booking;
END;
$function$;

-- customer_respond_offer: unchanged signature, unchanged declined/countered
-- branches and unchanged precondition checks. The accepted branch now
-- delegates to _finalize_job_acceptance instead of updating job_offers
-- directly and relying on lock_booking_on_offer_accepted (fixed
-- separately, but this RPC no longer depends on it for correctness) to
-- cascade to bookings -- this RPC now writes bookings + job_offers +
-- work_orders itself, atomically, in one transaction, and creates a
-- work order for the first time on this path.
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
      v_offer.booking_id, v_offer.contractor_id, COALESCE(v_contractor_name, ''), v_offer.quoted_price, p_offer_id
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

-- contractor_respond_counter: same pattern -- unchanged signature and
-- declined branch, accepted branch now delegates to
-- _finalize_job_acceptance.
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
      v_offer.booking_id, v_offer.contractor_id, COALESCE(v_contractor_name, ''), v_offer.counter_price, p_offer_id
    );
  ELSIF p_action = 'declined' THEN
    UPDATE job_offers SET contractor_final = 'declined', status = 'declined' WHERE id = p_offer_id;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$function$;
