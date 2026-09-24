CREATE OR REPLACE FUNCTION public.process_account_deletion(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req record;
  v_uid uuid;
  v_is_contractor boolean;
  v_is_customer boolean;
  v_active_reason text;
  v_storage jsonb;
BEGIN
  SELECT * INTO v_req FROM account_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_pending');
  END IF;
  IF v_req.scheduled_delete_at > now() THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_due');
  END IF;

  v_uid := v_req.user_id;
  v_is_contractor := EXISTS(SELECT 1 FROM contractors WHERE id = v_uid);
  v_is_customer   := EXISTS(SELECT 1 FROM users WHERE id = v_uid);

  SELECT string_agg(reason, '; ') INTO v_active_reason FROM (
    SELECT 'active booking ' || id AS reason FROM bookings
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status NOT IN ('completed','declined','cancelled')
    UNION ALL
    SELECT 'active work order ' || id FROM work_orders
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status NOT IN ('completed','cancelled')
    UNION ALL
    SELECT 'held payment on booking ' || id FROM bookings
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND payment_status = 'held'
    UNION ALL
    SELECT 'unsettled payment_intent ' || pi.id FROM payment_intents pi
      JOIN bookings b ON b.id = pi.booking_id
      WHERE (b.customer_id = v_uid OR b.contractor_id = v_uid)
        AND pi.status NOT IN ('captured','released','refunded')
    UNION ALL
    SELECT 'open dispute ' || id FROM disputes
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status <> 'resolved'
  ) reasons;

  IF v_active_reason IS NOT NULL THEN
    UPDATE account_deletion_requests
      SET defer_reason = v_active_reason, last_attempted_at = now()
      WHERE id = p_request_id;
    RETURN jsonb_build_object('deferred', true, 'reason', v_active_reason);
  END IF;

  UPDATE bookings    SET customer_name   = 'Deleted User' WHERE customer_id   = v_uid;
  UPDATE bookings    SET contractor_name = 'Deleted User' WHERE contractor_id = v_uid;
  UPDATE work_orders SET customer_name   = 'Deleted User' WHERE customer_id   = v_uid;
  UPDATE work_orders SET contractor_name = 'Deleted User' WHERE contractor_id = v_uid;
  UPDATE reviews     SET reviewer_name   = 'Former customer' WHERE customer_id = v_uid;
  UPDATE messages    SET sender_name     = 'Deleted User' WHERE sender_id = v_uid;

  DELETE FROM notifications         WHERE user_id = v_uid;
  DELETE FROM availability          WHERE contractor_id = v_uid;
  DELETE FROM contractor_schedule   WHERE contractor_id = v_uid;
  DELETE FROM contractor_locations  WHERE contractor_id = v_uid;
  DELETE FROM contractor_portfolio  WHERE contractor_id = v_uid;
  DELETE FROM contractor_trades     WHERE contractor_id = v_uid;
  DELETE FROM contractor_verification WHERE contractor_id = v_uid;
  DELETE FROM job_views             WHERE contractor_id = v_uid;
  DELETE FROM time_slots            WHERE contractor_id = v_uid;
  DELETE FROM subscriptions         WHERE contractor_id = v_uid;
  DELETE FROM portfolio_jobs        WHERE contractor_id = v_uid;
  DELETE FROM customer_coupons      WHERE user_id = v_uid;
  DELETE FROM job_match_logs        WHERE user_id = v_uid;
  DELETE FROM contact_messages      WHERE user_id = v_uid;
  DELETE FROM payment_waitlist      WHERE user_id = v_uid;
  DELETE FROM otp_codes             WHERE user_id = v_uid;
  DELETE FROM support_messages      WHERE user_id = v_uid;
  DELETE FROM booking_calendar      WHERE contractor_id = v_uid OR customer_id = v_uid;
  DELETE FROM contractor_employees  WHERE user_id = v_uid;
  DELETE FROM employees             WHERE auth_user_id = v_uid;

  SELECT jsonb_build_object(
    'avatars',             COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'avatars' AND name LIKE v_uid::text || '/%'), '{}'),
    'job-photos',          COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'job-photos' AND name LIKE v_uid::text || '/%'), '{}'),
    'portfolio',            COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'portfolio' AND name LIKE v_uid::text || '/%'), '{}'),
    'portfolio-completed', COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'portfolio-completed' AND name LIKE v_uid::text || '/%'), '{}'),
    'verification-docs',   COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'verification-docs' AND name LIKE 'verification/' || v_uid::text || '/%'), '{}'),
    'work-orders',         COALESCE((
      SELECT array_agg(o.name) FROM storage.objects o
      WHERE o.bucket_id = 'work-orders'
        AND EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE (wo.customer_id = v_uid OR wo.contractor_id = v_uid)
            AND o.name LIKE wo.id::text || '/%'
        )
    ), '{}')
  ) INTO v_storage;

  DELETE FROM auth.identities WHERE user_id = v_uid;
  DELETE FROM auth.sessions WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;

  IF v_is_customer THEN
    UPDATE users SET
      full_name = 'Deleted User',
      username = 'deleted-' || substr(v_uid::text, 1, 8),
      email = 'deleted-' || v_uid::text || '@invalid',
      phone = NULL, avatar_url = NULL, location = NULL, lat = NULL, lng = NULL,
      last_location_update = NULL, push_token = NULL,
      referral_source = NULL, referral_code = NULL,
      two_factor_phone = NULL, two_factor_enabled = false,
      deleted_at = now()
    WHERE id = v_uid;
  END IF;

  IF v_is_contractor THEN
    UPDATE contractors SET
      company_name = 'Deleted Contractor', legal_name = NULL,
      username = 'deleted-' || substr(v_uid::text, 1, 8),
      email = 'deleted-' || v_uid::text || '@invalid',
      phone = NULL, avatar = NULL, avatar_url = NULL, banner_url = NULL,
      website = NULL, tagline = NULL, description = NULL, experience = NULL,
      location = NULL, address = NULL, business_city = NULL, business_state = NULL,
      service_area = NULL, service_areas = NULL,
      license_number = NULL, license_expiration = NULL, license_county = NULL,
      license_state = NULL, license_url = NULL, insurance_url = NULL,
      lat = NULL, lng = NULL, commercial_lat = NULL, commercial_lng = NULL,
      service_area_lat = NULL, service_area_lng = NULL, last_location_update = NULL,
      push_token = NULL, company_tag = NULL, company_pin_hash = NULL,
      is_available = false, is_online = false, show_on_map = false,
      profile_published = false, accepts_bookings = false,
      deleted_at = now()
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'processed', true,
    'user_id', v_uid,
    'role', v_req.role,
    'is_customer', v_is_customer,
    'is_contractor', v_is_contractor,
    'storage_targets', v_storage
  );
END;
$function$;