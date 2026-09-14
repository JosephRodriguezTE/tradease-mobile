-- Turns on email_on_new_job_posted() -- previously dormant (no
-- SECURITY DEFINER, RLS blocked the join for any ordinary customer
-- session). Two gates added before it's allowed to fire for real:
--
-- 1. Preference respect. contractors.allow_notifications (real, set at
-- signup, fetched by the dead match-job edge function but never actually
-- checked anywhere) and contractors.notification_prefs->>'email_new_job'
-- (jsonb, default '{}' on every real row today -- nobody has ever set
-- it, but match-job's dead code already established this exact key name
-- and "!== false" semantics as the convention; reused rather than
-- inventing a second one). Both gates are new -- nothing in this
-- codebase checked either before this migration.
--
-- 2. Time-of-day. Emergency jobs (bookings.urgency = 'emergency') send
-- immediately regardless of time -- that's the entire reason a
-- contractor would want a 3am email. Everything else only sends
-- immediately during working hours (8am-9pm America/New_York); outside
-- that window it's held (job_email_sent_at stays null) and picked up by
-- a sweep once morning arrives, not dropped. This costs the same as a
-- flat "working-hours only, drop the rest" rule (one new column, one
-- sweep function, one cron entry) but is strictly better for the same
-- price -- no reason to drop overnight jobs instead of holding them once
-- you're paying for the sweep machinery either way.
--
-- job_email_sent_at doubles as the idempotency guard (a booking is only
-- ever processed once, whether immediately or by the sweep) and the
-- "still queued" signal (null = not yet sent). Backfilled to now() for
-- every existing booking in this same migration -- there were 4 real
-- open bookings at migration time, some months old; without this
-- backfill the first sweep tick would retroactively email real
-- contractors about all of them.
ALTER TABLE public.bookings ADD COLUMN job_email_sent_at timestamptz;
UPDATE public.bookings SET job_email_sent_at = now() WHERE job_email_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public._within_working_hours()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXTRACT(hour FROM now() AT TIME ZONE 'America/New_York') BETWEEN 8 AND 20;
$function$;

REVOKE ALL ON FUNCTION public._within_working_hours() FROM PUBLIC, anon, authenticated;

-- Shared by the trigger (immediate send) and the sweep (held send) --
-- one place that knows how to find matching, opted-in contractors and
-- email them for a given booking, so the two callers can't drift.
-- Always marks job_email_sent_at when it runs, even on zero matches, so
-- a booking is only ever attempted once.
CREATE OR REPLACE FUNCTION public._send_new_job_email(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_contractor RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR v_booking.contractor_id IS NOT NULL OR v_booking.status != 'pending' THEN
    RETURN;
  END IF;

  FOR v_contractor IN
    SELECT DISTINCT u.email
    FROM public.contractors c
    JOIN public.users u ON u.id = c.id
    WHERE c.is_available = true
      AND c.verification_status = 'approved'
      AND c.allow_notifications = true
      AND (c.notification_prefs ->> 'email_new_job') IS DISTINCT FROM 'false'
      AND u.email IS NOT NULL
      AND (v_booking.trade IS NULL OR EXISTS (
        SELECT 1 FROM public.contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = v_booking.trade
      ))
  LOOP
    PERFORM public.send_email('new_job_nearby', v_contractor.email, jsonb_build_object(
      'trade', COALESCE(v_booking.trade,'Job'),
      'address', COALESCE(v_booking.job_address,'Near you'),
      'price', COALESCE(v_booking.price_estimate::TEXT,'—')
    ));
  END LOOP;

  UPDATE public.bookings SET job_email_sent_at = now() WHERE id = p_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._send_new_job_email(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_on_new_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NULL AND NEW.status = 'pending' THEN
    IF NEW.urgency = 'emergency' OR public._within_working_hours() THEN
      PERFORM public._send_new_job_email(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_on_new_job_posted() FROM PUBLIC, anon, authenticated;

-- Cron-only, same 15-minute cadence as the other two sweeps in this
-- project. The working-hours gate lives inside the function body (via
-- _within_working_hours(), evaluated fresh every tick) rather than in
-- the cron schedule itself, so it self-corrects across DST without a
-- hand-picked UTC offset.
CREATE OR REPLACE FUNCTION public.sweep_overnight_job_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
BEGIN
  IF NOT public._within_working_hours() THEN
    RETURN;
  END IF;

  FOR v_booking IN
    SELECT id FROM public.bookings
    WHERE job_email_sent_at IS NULL
      AND contractor_id IS NULL
      AND status = 'pending'
  LOOP
    PERFORM public._send_new_job_email(v_booking.id);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_overnight_job_emails() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('sweep-overnight-job-emails', '*/15 * * * *', 'SELECT public.sweep_overnight_job_emails()');

-- Proved live (all committed at ~1:40am America/New_York, so the
-- immediate-vs-held branches were exercised by real, not simulated,
-- clock time):
-- - Emergency booking at 1am: job_email_sent_at set immediately; real
--   contractor matched via contractor_trades; net._http_response shows
--   {"success":true} with no "stub" field -- send-email only omits the
--   stub flag when RESEND_API_KEY is set and the real Resend API call
--   returned res.ok, so this is a genuine Resend acceptance, not a stub.
-- - Same contractor with notification_prefs={"email_new_job":false}:
--   second emergency booking still marks job_email_sent_at (attempted
--   once, correctly) but generates zero matching http_response rows --
--   no email sent. Restored notification_prefs to {} afterward.
-- - Normal-urgency booking at 1am: job_email_sent_at stays null
--   (correctly held). sweep_overnight_job_emails() called directly at
--   1am is a no-op (still null afterward), proving its own time gate.
--   _send_new_job_email() called directly on the same held booking
--   (simulating morning) then sends correctly and marks it -- proving
--   the sweep's dispatch logic, since real time can't be fast-forwarded
--   to actually watch the cron fire at 8am.
-- All three test bookings and their notifications deleted, zero
-- remaining. Grants confirmed clean on all four functions.
