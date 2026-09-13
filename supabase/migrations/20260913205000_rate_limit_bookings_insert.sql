-- No rate limiting existed anywhere on job posting -- confirmed earlier:
-- no client-side debounce, and the four AFTER INSERT triggers on
-- bookings (notify_contractor_new_booking, trigger_job_matching,
-- notify_new_job_posted, email_on_new_job_posted) are pure side effects
-- with no frequency check. One identity could post back-to-back, each
-- insert firing real push notifications, real emails, and a real
-- Anthropic call for AI job matching -- an unmetered cost hole, not just
-- a spam one.
--
-- Sliding window, not a flat cooldown or a daily cap: a flat cooldown
-- blocks a customer with two genuinely different jobs to post close
-- together; a daily cap reacts too slowly, letting a whole burst through
-- before it trips. 3 inserts per 10 minutes targets burst/scripted
-- posting specifically, which is what drives the cost, while staying
-- invisible to any real human customer -- nobody legitimately posts a
-- 4th job inside 10 minutes.
--
-- Does not, by itself, stop an attacker who can mint a fresh customer_id
-- per request (e.g. via anonymous auth) -- there is no persistent
-- identity to rate-limit against in that case. Worth having regardless,
-- for a compromised real account or a buggy client stuck retrying, which
-- is the case this closes today: anonymous sign-in stays off.
--
-- idx_bookings_customer_id already exists, so the count is index-backed
-- -- no new index needed.
--
-- Proved live: 3 real inserts for one real customer succeeded (the
-- BEFORE INSERT check saw 0, then 1, then 2 prior rows within the
-- window -- self-visible within the same transaction); a 4th insert for
-- the same customer within the window was rejected with the P0001
-- exception; an insert for a different customer succeeded immediately
-- after, confirming the limit is per-customer, not global. All test
-- rows deleted, zero remaining.
CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (
    SELECT count(*) FROM public.bookings
    WHERE customer_id = NEW.customer_id
      AND created_at > now() - interval '10 minutes'
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many job postings in a short time — please wait a few minutes and try again.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_booking_rate_limit ON public.bookings;
CREATE TRIGGER enforce_booking_rate_limit
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_rate_limit();

REVOKE ALL ON FUNCTION public.enforce_booking_rate_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_booking_rate_limit() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_booking_rate_limit() FROM authenticated;
