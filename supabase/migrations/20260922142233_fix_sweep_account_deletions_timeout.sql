CREATE OR REPLACE FUNCTION public.sweep_account_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_internal_secret text;
BEGIN
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_secret';

  FOR v_req IN
    SELECT id FROM public.account_deletion_requests
    WHERE status = 'pending' AND scheduled_delete_at <= now()
  LOOP
    PERFORM net.http_post(
      url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/process-account-deletions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-tradease-internal', v_internal_secret
      ),
      body := jsonb_build_object('request_id', v_req.id),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$;