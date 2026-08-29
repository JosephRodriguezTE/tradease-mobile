-- Replace the launch_signups Database Webhook (supabase_functions.http_request,
-- with a legacy service_role JWT hardcoded directly into the trigger's tgargs
-- via CREATE TRIGGER ... EXECUTE FUNCTION supabase_functions.http_request(...))
-- with a custom net.http_post trigger, matching trigger_job_matching /
-- trigger_send_push_notification. The secret is now looked up from Vault at
-- fire time instead of being a literal baked into pg_trigger -- which,
-- like pg_proc.prosrc, is readable via pg_get_triggerdef() by anyone with
-- SELECT on pg_trigger (same class of exposure as the prosrc finding from
-- the earlier hardcoded-secrets migration).
--
-- Also switches auth from Authorization: Bearer <service_role JWT> to
-- x-tradease-internal, matching charge-customer and send-push-notification
-- -- the edge function's own auth check was changed to match in the same
-- deploy, and its verify_jwt was flipped to false (x-tradease-internal
-- isn't a JWT, so the platform's own JWT gate would otherwise reject it
-- before the function body ever ran).

CREATE OR REPLACE FUNCTION public.trigger_send_launch_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal_secret text;
BEGIN
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_secret';

  PERFORM net.http_post(
    url     := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/send-launch-confirmation',
    body    := jsonb_build_object('record', to_jsonb(NEW)),
    headers := jsonb_build_object(
                 'Content-Type',        'application/json',
                 'x-tradease-internal', v_internal_secret
               )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a launch signup due to a notification-hook failure.
  RAISE NOTICE 'trigger_send_launch_confirmation: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS launch_signups ON public.launch_signups;

CREATE TRIGGER launch_signups
AFTER INSERT ON public.launch_signups
FOR EACH ROW EXECUTE FUNCTION public.trigger_send_launch_confirmation();

-- Verified after this ran (see commit message for the full proof):
--   - Fired for real via a disposable launch_signups row. key_source:
--     sb_secret logged for send-launch-confirmation, x-tradease-internal
--     auth passed, and its own call to send-email (via plain fetch, see
--     index.ts) also logged key_source: sb_secret and passed send-email's
--     auth check -- no 401 anywhere in the chain.
--   - The only remaining failure was send-email's Resend API call itself
--     returning 403 "The send.tradease.tech domain is not verified" --
--     a pre-existing Resend domain-verification gap, unrelated to this
--     migration and out of scope here. Would fail identically under the
--     legacy key.
--   - Test row deleted after verification.
