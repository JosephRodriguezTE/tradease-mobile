-- trigger_job_matching was reading 'service_role_key' from Vault, which
-- holds the legacy service_role JWT (seeded from trigger_job_matching's
-- own prior hardcoded value, back when the hardcoded-secrets migration
-- ran). Point it at 'service_role_key_v2' instead, which holds the new
-- sb_secret_ key -- confirmed by a direct test (raw net.http_post to
-- on-booking-created with service_role_key_v2 sent as Authorization:
-- Bearer) that an sb_secret_ key authenticates fine against a
-- verify_jwt: true edge function gateway this way; real status 200,
-- see commit message for the full test record.
--
-- Only the vault secret name changes. No other logic touched.

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
  FROM vault.decrypted_secrets WHERE name = 'service_role_key_v2';

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

-- Verified after this ran (see commit message for the full proof):
--   - Pre-change diagnostic: raw net.http_post to on-booking-created
--     (verify_jwt: true) with service_role_key_v2 sent as
--     Authorization: Bearer -- real status 200, on-booking-created's
--     own "booking_not_found" business response, and a fresh
--     key_source: sb_secret log line. Answers the open migration-plan
--     question: yes, an sb_secret_ key authenticates against a
--     verify_jwt: true gateway sent this way -- contrary to what the
--     earlier docs research suggested (that a non-JWT value in
--     Authorization would be rejected before the function ran).
--   - Post-change: fired trigger_job_matching for real via a disposable
--     temp table + isolated trigger (same technique used earlier this
--     session), isolated from bookings' other 18 triggers. Real status
--     200 from net._http_response, fresh key_source: sb_secret logged.
--     Temp table dropped after verification.
