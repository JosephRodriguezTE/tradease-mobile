-- Was 4 hours, verified from the live definition before touching it --
-- far shorter than anyone's mental model of this system, including the
-- person who asked me to check. 24 hours: long enough that a customer
-- who checks their phone at night still sees it, short enough that a
-- job isn't locked to one contractor indefinitely.
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
