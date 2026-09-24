CREATE OR REPLACE FUNCTION public.submit_review(p_booking_id uuid, p_rating integer, p_review_text text DEFAULT NULL::text)
RETURNS reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking       RECORD;
  v_reviewer_name TEXT;
  v_review        public.reviews;
  v_new_avg       NUMERIC;
  v_new_count     INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.customer_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the customer on this booking can leave a review' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status NOT IN ('completed', 'approved') THEN
    RAISE EXCEPTION 'Reviews can only be submitted for completed or approved bookings' USING ERRCODE = '42501';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_reviewer_name FROM public.users WHERE id = auth.uid();

  PERFORM set_config('app.bypass_protection', 'rating', true);

  INSERT INTO public.reviews (booking_id, contractor_id, customer_id, reviewer_name, rating_overall, review_text)
  VALUES (p_booking_id, v_booking.contractor_id, auth.uid(), COALESCE(v_reviewer_name, 'Customer'), p_rating, p_review_text)
  RETURNING * INTO v_review;

  SELECT AVG(rating_overall), COUNT(*) INTO v_new_avg, v_new_count
  FROM public.reviews
  WHERE contractor_id = v_booking.contractor_id AND flagged = false;

  UPDATE public.contractors
  SET rating = ROUND(v_new_avg, 2), review_count = v_new_count
  WHERE id = v_booking.contractor_id;

  RETURN v_review;
END;
$function$;