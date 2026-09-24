CREATE OR REPLACE FUNCTION public.protect_contractor_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope text := current_setting('app.bypass_protection', true);
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan AND v_scope IS DISTINCT FROM 'plan' THEN
      RAISE EXCEPTION 'plan cannot be changed directly; use the billing/upgrade flow' USING ERRCODE = '42501';
    END IF;
    IF NEW.rating IS DISTINCT FROM OLD.rating AND v_scope IS DISTINCT FROM 'rating' THEN
      RAISE EXCEPTION 'rating cannot be changed directly; submit a review instead' USING ERRCODE = '42501';
    END IF;
    IF NEW.review_count IS DISTINCT FROM OLD.review_count AND v_scope IS DISTINCT FROM 'rating' THEN
      RAISE EXCEPTION 'review_count cannot be changed directly' USING ERRCODE = '42501';
    END IF;
    IF NEW.verified IS DISTINCT FROM OLD.verified AND v_scope IS DISTINCT FROM 'verification' THEN
      RAISE EXCEPTION 'verified cannot be set directly' USING ERRCODE = '42501';
    END IF;
    IF NEW.license_verified IS DISTINCT FROM OLD.license_verified AND v_scope IS DISTINCT FROM 'verification' THEN
      RAISE EXCEPTION 'license_verified cannot be set directly' USING ERRCODE = '42501';
    END IF;
    IF NEW.insurance_verified IS DISTINCT FROM OLD.insurance_verified AND v_scope IS DISTINCT FROM 'verification' THEN
      RAISE EXCEPTION 'insurance_verified cannot be set directly' USING ERRCODE = '42501';
    END IF;
    IF NEW.insured IS DISTINCT FROM OLD.insured AND v_scope IS DISTINCT FROM 'verification' THEN
      RAISE EXCEPTION 'insured cannot be set directly' USING ERRCODE = '42501';
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND NEW.verification_status != 'pending_review'
       AND v_scope IS DISTINCT FROM 'verification' THEN
      RAISE EXCEPTION 'verification_status can only be self-set to pending_review' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_contractor_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_scope text := current_setting('app.bypass_protection', true);
begin
  if auth.uid() is not null then
    if new.plan is distinct from old.plan and v_scope is distinct from 'plan' then
      raise exception 'Plan and billing fields can only be updated by the system'
        using errcode = 'TE001';
    end if;
    if new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    then
      raise exception 'Plan and billing fields can only be updated by the system'
        using errcode = 'TE001';
    end if;
  end if;
  return new;
end;
$function$;

DROP FUNCTION IF EXISTS public.submit_review(uuid, numeric, text);

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

  INSERT INTO public.reviews (booking_id, contractor_id, customer_id, reviewer_name, rating_overall, review_text)
  VALUES (p_booking_id, v_booking.contractor_id, auth.uid(), COALESCE(v_reviewer_name, 'Customer'), p_rating, p_review_text)
  RETURNING * INTO v_review;

  SELECT AVG(rating_overall), COUNT(*) INTO v_new_avg, v_new_count
  FROM public.reviews
  WHERE contractor_id = v_booking.contractor_id AND flagged = false;

  PERFORM set_config('app.bypass_protection', 'rating', true);

  UPDATE public.contractors
  SET rating = ROUND(v_new_avg, 2), review_count = v_new_count
  WHERE id = v_booking.contractor_id;

  RETURN v_review;
END;
$function$;

CREATE FUNCTION public.admin_update_contractor_plan(p_contractor_id uuid, p_new_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and is_admin = true) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_new_plan not in ('free', 'leads', 'pro') then
    raise exception 'invalid plan: %', p_new_plan using errcode = '22023';
  end if;

  perform set_config('app.bypass_protection', 'plan', true);

  update public.contractors set plan = p_new_plan where id = p_contractor_id;
end
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_contractor_plan(uuid, text) TO authenticated, service_role, postgres;
REVOKE EXECUTE ON FUNCTION public.admin_update_contractor_plan(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_contractor_plan(uuid, text) FROM anon;