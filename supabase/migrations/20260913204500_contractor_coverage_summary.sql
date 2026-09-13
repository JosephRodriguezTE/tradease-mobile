-- Guest-facing density preview: aggregate contractor counts per trade,
-- no coordinates, no ids, no names, no records of any kind. This is the
-- one part of the contractor map genuinely safe to grant to anon --
-- counts aren't identifying at real scale.
--
-- Except at small numbers, which is the whole risk at today's real
-- scale (3 total contractors). A per-trade count of 1 or 2 is close to
-- naming a specific business, especially combined with anything else a
-- viewer already knows. Suppressed via HAVING count >= 3, a standard
-- statistical-disclosure-control threshold (don't publish a cell below
-- 3) -- a trade under that count is omitted entirely, not shown as
-- "some", which would itself be a signal. radius_miles is floored at 1
-- mile: this feature has no legitimate reason to run at sub-mile
-- granularity, and flooring it closes off the cheapest version of a
-- probe-a-tiny-circle attack. Not solved, and not attempted here: many
-- individually-safe queries at different points could still be combined
-- into a density map over time (a grid-sweep attack) -- real defense
-- against that is a much bigger undertaking than this feature warrants
-- at zero live customers.
--
-- trade_type can hold a comma-separated list for multi-trade companies
-- (e.g. "HVAC, Electrical") -- unnested so a multi-trade contractor
-- counts toward every trade they actually list, not just the first.
--
-- Same eligibility filters as contractors_nearby(): a contractor who
-- opted out of show_on_map shouldn't inflate anyone's mental model of
-- coverage near them either.
--
-- Proved: real anon session against today's real data returns zero rows
-- (only one contractor is currently eligible at all -- correctly
-- suppressed). Aggregation/threshold logic proved separately against a
-- synthetic 10-row (id, trade_type) set, no table touched: 4 electricians
-- (one multi-trade) and 3 plumbers correctly returned; 2 painters and
-- 1 roofer correctly suppressed.
CREATE OR REPLACE FUNCTION public.contractor_coverage_summary(
  user_lat double precision,
  user_lng double precision,
  radius_miles double precision DEFAULT 25
)
RETURNS TABLE(trade text, contractor_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH eligible AS (
    SELECT c.id, c.trade_type
    FROM contractors c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND c.is_available = true
      AND c.verification_status = 'approved'
      AND c.profile_published = true
      AND c.show_on_map = true
      AND haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8)
          <= GREATEST(radius_miles, 1)
  ),
  per_trade AS (
    SELECT DISTINCT e.id, trim(t) AS trade
    FROM eligible e
    CROSS JOIN LATERAL unnest(string_to_array(e.trade_type, ',')) AS t
    WHERE trim(t) <> ''
  )
  SELECT trade, count(*) AS contractor_count
  FROM per_trade
  GROUP BY trade
  HAVING count(*) >= 3
  ORDER BY contractor_count DESC, trade ASC;
$function$;

REVOKE ALL ON FUNCTION public.contractor_coverage_summary(double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_coverage_summary(double precision, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.contractor_coverage_summary(double precision, double precision, double precision) TO authenticated;
