-- Migrate hardcoded secrets out of function bodies and into Supabase Vault.
--
-- Prerequisite work before rotating service_role_key / the internal
-- service-to-service secret: both were previously pasted as literal
-- strings into four SECURITY DEFINER functions' prosrc — and prosrc is
-- readable by PUBLIC on pg_proc by default (confirmed: `authenticated`
-- could SELECT it directly, no special privilege needed). Rotating first
-- without this step would still leave the *old* key sitting in Vault-less
-- plaintext in the database, findable the same way, defeating the point.
--
-- Step 1 — seed three Vault secrets from the CURRENT hardcoded values, so
-- nothing breaks mid-migration. The literal secret values never appear in
-- this file: each is pulled out of the existing hardcoded prosrc via
-- regex extraction, in the same statement that hands it to
-- vault.create_secret(), so the plaintext only ever exists inside
-- Postgres's own execution, never typed anywhere.
--
--   service_role_key  <- extracted from trigger_job_matching (JWT, role: service_role)
--   internal_secret    <- extracted from sweep_auto_approve_work_orders (trd_int_... — verified
--                          identical to the copy in send_email before this ran)
--   anon_key           <- extracted from trigger_send_push_notification (JWT, role: anon) —
--                          migrated too, for one consistent secrets convention across all four,
--                          even though it's a lower-severity find (anon key is meant to be public)

SELECT vault.create_secret(
  (SELECT substring(prosrc from 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+') FROM pg_proc WHERE proname = 'trigger_job_matching' AND pronamespace = 'public'::regnamespace),
  'service_role_key',
  'Supabase service_role JWT. Migrated out of trigger_job_matching prosrc, which had it hardcoded and world-readable via pg_proc.'
);

SELECT vault.create_secret(
  (SELECT substring(prosrc from 'trd_int_[0-9a-f]+') FROM pg_proc WHERE proname = 'sweep_auto_approve_work_orders' AND pronamespace = 'public'::regnamespace),
  'internal_secret',
  'Internal service-to-service secret (x-tradease-internal header). Migrated out of sweep_auto_approve_work_orders / send_email prosrc, both hardcoded and world-readable via pg_proc.'
);

SELECT vault.create_secret(
  (SELECT substring(prosrc from 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+') FROM pg_proc WHERE proname = 'trigger_send_push_notification' AND pronamespace = 'public'::regnamespace),
  'anon_key',
  'Supabase anon/publishable JWT. Migrated out of trigger_send_push_notification prosrc for one consistent secrets convention across these four functions.'
);

-- Step 2 — rewrite all four to read from vault.decrypted_secrets instead
-- of holding a literal. All four stay SECURITY DEFINER (their owner,
-- postgres, has SELECT on vault.decrypted_secrets — confirmed before
-- this ran) and all four now have search_path pinned to 'public'
-- (trigger_job_matching and trigger_send_push_notification already had
-- it; sweep_auto_approve_work_orders and send_email did not, and were
-- flagged by the Supabase advisor for it — fixed here as a natural part
-- of rewriting these bodies anyway). No other logic changed: same URLs,
-- same headers, same request bodies, same exception handling (or lack of
-- it) as before — only the secret's source moved.

CREATE OR REPLACE FUNCTION public.trigger_job_matching()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_role_key text;
BEGIN
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  PERFORM net.http_post(
    url     := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/on-booking-created',
    body    := jsonb_build_object(
                 'booking_id',  NEW.id,
                 'customer_id', NEW.customer_id
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_service_role_key
               )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block booking creation due to AI hook failure
  RAISE NOTICE 'trigger_job_matching: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_auto_approve_work_orders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wo RECORD;
  v_internal_secret text;
BEGIN
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_secret';

  FOR v_wo IN
    SELECT id FROM public.work_orders
    WHERE status = 'completed'
      AND auto_approve_at IS NOT NULL
      AND auto_approve_at <= NOW()
  LOOP
    -- Mark approved first so the charge function accepts it
    UPDATE public.work_orders SET status = 'approved' WHERE id = v_wo.id;

    -- Call charge-customer via pg_net
    PERFORM net.http_post(
      url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/charge-customer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-tradease-internal', v_internal_secret
      ),
      body := jsonb_build_object('work_order_id', v_wo.id::text)
    );

    RAISE NOTICE 'Auto-approved work order %', v_wo.id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_email(p_template text, p_to text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal_secret text;
BEGIN
  IF p_to IS NULL OR p_to = '' THEN RETURN; END IF;

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_secret';

  PERFORM net.http_post(
    url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tradease-internal', v_internal_secret
    ),
    body := jsonb_build_object('template', p_template, 'to', p_to, 'data', p_data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send_email failed: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anon_key text;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets WHERE name = 'anon_key';

  PERFORM net.http_post(
    url     := 'https://linqsojbszglbgpoxgtv.functions.supabase.co/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := jsonb_build_object('notification_id', NEW.id::text)
  );
  RETURN NEW;
END;
$function$;

-- Verified after this ran (see commit message for the full proof):
--   - As `authenticated`: prosrc for all four now contains neither a
--     JWT-shaped string nor `trd_int_` — confirmed by direct query, not
--     assumed.
--   - trigger_job_matching: fired for real via a temp table + temp
--     trigger (isolated from bookings' other 18 triggers), got a real
--     HTTP 200 with on-booking-created's own business-logic response
--     (booking_not_found) — proves the vault-sourced key passed gateway
--     JWT verification and the function executed.
--   - sweep_auto_approve_work_orders: the full function currently cannot
--     run end-to-end — its loop does `SET status = 'approved'`, which is
--     not a valid work_order_status enum value (separate, pre-existing
--     bug, same class as the one fixed in mark_work_order_paid, not
--     touched here). Tested the exact net.http_post + vault-lookup call
--     it makes directly instead: got HTTP 404 from charge-customer's own
--     "Work order not found" logic — proves the vault-sourced internal
--     secret is accepted.
--   - send_email: ran for real, got HTTP 401 from the deployed
--     send-email function. Expected, not a regression — send-email
--     checks `Authorization: Bearer <service_role_key>`, never
--     `x-tradease-internal`, a pre-existing mismatch reported before this
--     migration and explicitly out of scope here.
--   - trigger_send_push_notification: fired for real via a disposable
--     notifications row (its only trigger on that table). Got HTTP 401
--     "Unauthorized" — expected, not a regression, for the same reason:
--     send-push-notification only checks `x-tradease-internal`, never
--     `Authorization`, regardless of what the header contains.
