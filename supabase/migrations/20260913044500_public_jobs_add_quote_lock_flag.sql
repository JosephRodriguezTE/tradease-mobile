-- Confirmed live before this: public_jobs_nearby()/public_job_by_id() never
-- reflected a pending quote -- a job with an active quote looked identical
-- to a fully open job to every other browsing contractor. Direct consequence
-- of submit_quote() never touching bookings.status/contractor_id while a
-- quote is outstanding (see 20260913041500_submit_quote_exclusivity.sql).
--
-- Adds is_quote_locked/quote_locked_until so the client can keep showing
-- the job (a feed that empties out looks broken) while disabling the quote
-- CTA and telling the contractor when it might free up. Postgres can't add
-- output columns to an existing RETURNS TABLE signature via CREATE OR
-- REPLACE, so both functions are dropped and recreated.
--
-- quote_locked_until resolves to counter_expires_at once the offer is in
-- 'countered' state, since that's the deadline that actually governs the
-- job at that point -- expires_at (the original quote deadline) no longer
-- applies once a counter is in flight.
--
-- Proved directly: inserted a real booking + a real 'quoted' offer, called
-- both RPCs, confirmed is_quote_locked=true and quote_locked_until matches
-- the offer's expires_at. Then flipped the same offer to 'countered' with a
-- counter_expires_at and re-queried both RPCs, confirming quote_locked_until
-- switched to counter_expires_at. Test booking and offer deleted, zero rows
-- confirmed remaining. Grants confirmed clean via
-- information_schema.routine_privileges immediately after applying:
-- authenticated/postgres/service_role only, no anon, on both functions.
DROP FUNCTION IF EXISTS public.public_jobs_nearby(double precision, double precision, double precision, text);

CREATE OR REPLACE FUNCTION public.public_jobs_nearby(
  user_lat double precision,
  user_lng double precision,
  max_miles double precision DEFAULT 50,
  trade_filter text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid, trade text, description text, urgency text, status text,
  price_estimate integer, created_at timestamp with time zone,
  request_expires_at timestamp with time zone, fuzzed_lat double precision,
  fuzzed_lng double precision, town text, nearest_major_road text,
  is_instant_book boolean, instant_book_price integer,
  is_quote_locked boolean, quote_locked_until timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    b.id,
    b.trade,
    b.description,
    b.urgency,
    b.status,
    b.price_estimate,
    b.created_at,
    b.request_expires_at,
    fz.fuzzed_lat,
    fz.fuzzed_lng,
    b.town,
    b.nearest_major_road,
    b.is_instant_book,
    b.instant_book_price,
    ao.offer_status IS NOT NULL AS is_quote_locked,
    CASE WHEN ao.offer_status = 'countered' THEN COALESCE(ao.counter_expires_at, ao.expires_at) ELSE ao.expires_at END AS quote_locked_until
  FROM public.bookings b
  CROSS JOIN LATERAL public.fuzz_point(b.id, b.job_lat::double precision, b.job_lng::double precision, 600) fz
  LEFT JOIN LATERAL (
    SELECT jo.status AS offer_status, jo.expires_at, jo.counter_expires_at
    FROM public.job_offers jo
    WHERE jo.booking_id = b.id AND jo.status IN ('quoted', 'countered')
    ORDER BY jo.offered_at DESC
    LIMIT 1
  ) ao ON true
  WHERE b.status = 'pending'
    AND b.contractor_id IS NULL
    AND b.is_public = true
    AND (b.request_expires_at IS NULL OR b.request_expires_at > now())
    AND b.job_lat IS NOT NULL
    AND b.job_lng IS NOT NULL
    AND (trade_filter IS NULL OR b.trade = trade_filter)
    AND public.haversine_miles(user_lat, user_lng, b.job_lat::double precision, b.job_lng::double precision) <= max_miles
  ORDER BY b.created_at DESC
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) TO authenticated;

DROP FUNCTION IF EXISTS public.public_job_by_id(uuid);

CREATE OR REPLACE FUNCTION public.public_job_by_id(job_id uuid)
RETURNS TABLE(
  id uuid, trade text, description text, urgency text, status text,
  price_estimate integer, created_at timestamp with time zone,
  request_expires_at timestamp with time zone, fuzzed_lat double precision,
  fuzzed_lng double precision, town text, nearest_major_road text,
  is_instant_book boolean, instant_book_price integer,
  is_quote_locked boolean, quote_locked_until timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    b.id,
    b.trade,
    b.description,
    b.urgency,
    b.status,
    b.price_estimate,
    b.created_at,
    b.request_expires_at,
    fz.fuzzed_lat,
    fz.fuzzed_lng,
    b.town,
    b.nearest_major_road,
    b.is_instant_book,
    b.instant_book_price,
    ao.offer_status IS NOT NULL AS is_quote_locked,
    CASE WHEN ao.offer_status = 'countered' THEN COALESCE(ao.counter_expires_at, ao.expires_at) ELSE ao.expires_at END AS quote_locked_until
  FROM public.bookings b
  CROSS JOIN LATERAL public.fuzz_point(b.id, b.job_lat::double precision, b.job_lng::double precision, 600) fz
  LEFT JOIN LATERAL (
    SELECT jo.status AS offer_status, jo.expires_at, jo.counter_expires_at
    FROM public.job_offers jo
    WHERE jo.booking_id = b.id AND jo.status IN ('quoted', 'countered')
    ORDER BY jo.offered_at DESC
    LIMIT 1
  ) ao ON true
  WHERE b.id = job_id
    AND b.status = 'pending'
    AND b.contractor_id IS NULL
    AND b.is_public = true
    AND (b.request_expires_at IS NULL OR b.request_expires_at > now())
    AND b.job_lat IS NOT NULL
    AND b.job_lng IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.public_job_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_job_by_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_job_by_id(uuid) TO authenticated;
