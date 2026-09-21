-- public_jobs_nearby(): add trade_filter_ids, a multi-value trade filter
-- applied server-side, alongside (not instead of) the existing single-value
-- trade_filter.
--
-- trade_filter (text) is left completely alone -- it's a distinct concept,
-- not the same thing this migration adds. It's a manual, single-trade UI
-- filter the contractor explicitly picks on app/(tabs)/map.tsx (mobile) --
-- independent of what trades that contractor actually practices, and
-- deliberately staying that way (confirmed with the app owner). It's also
-- passed as null, deliberately, by the "missed jobs" call in
-- contractor-home.tsx, which intentionally counts every trade.
--
-- trade_filter_ids (text[]) is the new, separate thing: "only jobs matching
-- one of this contractor's own trades," matched via b.trade = ANY(...).
-- The caller is expected to pass contractor_trades.trade_id values, with
-- contractors.trade_type as a fallback for a contractor not yet migrated
-- into contractor_trades -- the exact same fallback rule already
-- implemented client-side in contractor-home.tsx's contractorTradeIds().
-- The RPC does not look up contractor_trades itself; it trusts the caller's
-- array, same trust level public_jobs_nearby() already extends to
-- trade_filter and max_miles.
--
-- Both filters are independent and AND together when both are supplied
-- (neither caller today passes both at once, but nothing stops it).
--
-- New parameter appended at the end and defaulted to NULL specifically so
-- adding it doesn't change the meaning of any existing positional call
-- (none of today's callers use positional args, but this keeps that option
-- safe going forward too).
--
-- Signature change means this is a new overload, not a replace of the old
-- one -- DROP first, matching every prior signature change to this
-- function, then re-apply the same authenticated-only lockdown grants.

DROP FUNCTION IF EXISTS public.public_jobs_nearby(double precision, double precision, double precision, text);

CREATE FUNCTION public.public_jobs_nearby(
  user_lat double precision,
  user_lng double precision,
  max_miles double precision DEFAULT 50,
  trade_filter text DEFAULT NULL::text,
  trade_filter_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  id uuid, trade text, description text, urgency text, status text,
  price_estimate integer, created_at timestamp with time zone,
  request_expires_at timestamp with time zone,
  fuzzed_lat double precision, fuzzed_lng double precision,
  town text, nearest_major_road text,
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
    AND (trade_filter_ids IS NULL OR b.trade = ANY(trade_filter_ids))
    AND public.haversine_miles(user_lat, user_lng, b.job_lat::double precision, b.job_lng::double precision) <= max_miles
  ORDER BY b.created_at DESC
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text, text[]) TO authenticated;
