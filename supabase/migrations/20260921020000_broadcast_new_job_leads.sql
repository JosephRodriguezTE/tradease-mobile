-- Realtime priority leads, rebuilt on Realtime Broadcast instead of
-- postgres_changes on bookings.
--
-- Why: postgres_changes re-applies bookings' RLS per subscriber. A browsing
-- contractor never satisfies bookings_owner_or_assigned_contractor_select
-- for a brand-new job (contractor_id is null pre-claim), so that channel
-- has never actually delivered a live "new job" event to a real contractor
-- -- verified empirically this session (signed-up throwaway customer +
-- contractor, zero events received for a genuinely new pending booking).
-- The only session that ever saw one was an is_admin account, via
-- admin_all_bookings' unrestricted ALL policy -- which is how the reported
-- bug (wrong-trade leads showing up live) was reproducible at all: RLS
-- normally blocks the event outright, so this bug only ever manifested for
-- an admin session bypassing that wall.
--
-- The considered alternative -- widen bookings RLS so a normal contractor
-- session receives the event -- was rejected: a policy doing exactly that
-- (contractors_see_open_pending_jobs) existed once and was deliberately
-- removed (see app/dashboard/contractor/job-board/page.tsx's own comment
-- in the website repo), specifically because postgres_changes has no
-- column projection of its own -- every subscriber gets the full row,
-- meaning customer_name, customer_phone, exact job_lat/job_lng, and exact
-- job_address would all leak to a browsing contractor before they've
-- accepted anything. public_jobs_nearby() exists precisely to avoid that
-- (SECURITY DEFINER, narrow column list, server-fuzzed coordinates via
-- fuzz_point()) and is the only read path for open jobs in both apps today.
--
-- This trigger reproduces that same narrow, fuzzed shape (same fuzz_point()
-- call, same field set minus is_quote_locked/quote_locked_until, which
-- can't be non-null on a row that was just inserted) and pushes it via
-- realtime.send() to a per-trade topic ('leads:<trade>') instead of the
-- raw table. bookings' RLS is untouched -- nothing about who can SELECT
-- bookings directly changes. Trade filtering happens by construction: a
-- contractor's client only ever opens the topic(s) matching their own
-- trades, so there's no client-side trade check left to drift out of sync
-- with the list the way the last bug happened.
--
-- private = true on the send() call requires a Realtime Authorization
-- policy on realtime.messages (RLS is already enabled there with zero
-- policies -- currently nobody can read any private channel in this
-- project). The policy below allows any authenticated user to read a
-- 'leads:%' topic; it deliberately does NOT try to further restrict which
-- trade topic an authenticated user may open -- the payload itself carries
-- no customer PII, so a contractor listening to a trade they don't
-- practice is a relevance problem, not a privacy one, and no worse than
-- map.tsx's own manual trade dropdown already allowing exactly that for
-- the polled list today.

CREATE OR REPLACE FUNCTION public.broadcast_new_job_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_fuzzed record;
BEGIN
  IF NEW.status = 'pending'
     AND NEW.contractor_id IS NULL
     AND NEW.is_public = true
     AND NEW.trade IS NOT NULL
     AND NEW.job_lat IS NOT NULL
     AND NEW.job_lng IS NOT NULL
  THEN
    SELECT * INTO v_fuzzed
    FROM public.fuzz_point(NEW.id, NEW.job_lat::double precision, NEW.job_lng::double precision, 600);

    PERFORM realtime.send(
      jsonb_build_object(
        'id',                 NEW.id,
        'trade',               NEW.trade,
        'description',         NEW.description,
        'urgency',             NEW.urgency,
        'status',              NEW.status,
        'price_estimate',      NEW.price_estimate,
        'created_at',          NEW.created_at,
        'request_expires_at',  NEW.request_expires_at,
        'fuzzed_lat',          v_fuzzed.fuzzed_lat,
        'fuzzed_lng',          v_fuzzed.fuzzed_lng,
        'town',                NEW.town,
        'nearest_major_road',  NEW.nearest_major_road,
        'is_instant_book',     NEW.is_instant_book,
        'instant_book_price',  NEW.instant_book_price
      ),
      'new_lead',
      'leads:' || NEW.trade,
      true
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_broadcast_new_job_lead ON public.bookings;
CREATE TRIGGER trg_broadcast_new_job_lead
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_new_job_lead();

DROP POLICY IF EXISTS "authenticated can read lead broadcasts" ON realtime.messages;
CREATE POLICY "authenticated can read lead broadcasts"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (realtime.topic() LIKE 'leads:%');
