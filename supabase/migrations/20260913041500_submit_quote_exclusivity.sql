-- The gap confirmed live before this: submit_quote() only ever checked
-- whether THIS contractor already had a quote on the job -- nothing
-- stopped a second, different contractor from quoting a job that
-- already had one outstanding. Booking status/contractor_id never
-- reflected a pending quote either (stays 'pending' / null the whole
-- time), so nothing else in the system would have caught this.
--
-- 'accepted' isn't in the exclusion list below because it can't
-- coexist with this check succeeding at all: accepting flips
-- bookings.status to 'confirmed', and the existing check just above
-- (status = 'pending') already rejects the booking before this one is
-- ever reached.
--
-- Proved directly: real booking, Contractor A's submit_quote succeeds,
-- Contractor B's submit_quote on the same booking immediately after
-- raises `P0001: This job already has an active quote from another
-- contractor`. Confirmed exactly one job_offers row exists afterward.
-- Test booking and offer deleted, zero rows confirmed remaining.
CREATE OR REPLACE FUNCTION public.submit_quote(p_booking_id uuid, p_quoted_price numeric, p_quote_note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_offer_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = p_booking_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Job is no longer available';
  END IF;
  IF EXISTS (
    SELECT 1 FROM job_offers
    WHERE booking_id = p_booking_id AND contractor_id = auth.uid()
      AND status NOT IN ('declined', 'expired', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'You already submitted a quote for this job';
  END IF;
  IF EXISTS (
    SELECT 1 FROM job_offers
    WHERE booking_id = p_booking_id AND contractor_id != auth.uid()
      AND status IN ('quoted', 'countered')
  ) THEN
    RAISE EXCEPTION 'This job already has an active quote from another contractor' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO job_offers (
    booking_id, contractor_id, quoted_price, quote_note,
    status, customer_action, contractor_final, initiated_by, expires_at
  ) VALUES (
    p_booking_id, auth.uid(), p_quoted_price, p_quote_note,
    'quoted', 'pending', 'pending', 'contractor', NOW() + INTERVAL '24 hours'
  ) RETURNING id INTO v_offer_id;
  RETURN v_offer_id;
END;
$function$;
