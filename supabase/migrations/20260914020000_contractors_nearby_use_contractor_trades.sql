-- Phase 1, function 1 of 4. Same signature and return shape as before --
-- only the trade_filter clause changes, from
-- `c.trade_type ILIKE '%' || trade_filter || '%'` (a substring match
-- against a possibly comma-joined string -- correct today only because
-- no canonical trade name happens to be a substring of another) to a
-- real membership check against contractor_trades. Still SECURITY
-- DEFINER reading contractors directly, so the EXISTS subquery against
-- contractor_trades runs under the same bypassed-RLS context, consistent
-- with how it already reads contractors.
--
-- Proved live against the real multi-trade contractor (1442f0ec,
-- trades HVAC + Electrical): trade_filter='Electrical' correctly
-- includes them (via the join, not string luck -- their trade_type is
-- now just 'HVAC'); trade_filter='Plumbing' (a trade they don't have)
-- correctly excludes them. anon still gets permission denied. Grants
-- confirmed clean via routine_privileges.
CREATE OR REPLACE FUNCTION public.contractors_nearby(
  user_lat double precision,
  user_lng double precision,
  max_miles double precision DEFAULT 50,
  trade_filter text DEFAULT NULL::text,
  specialty_filter text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid, company_name text, trade_type text, location text, service_area text,
  rating numeric, review_count integer, verified boolean, verification_status text,
  is_available boolean, plan text, avatar_url text, banner_url text,
  specializations jsonb, years_in_business integer, distance_miles double precision,
  pin_lat double precision, pin_lng double precision, pin_mode text,
  service_radius_miles numeric, area_label text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.company_name, c.trade_type, c.location, c.service_area,
    c.rating, c.review_count, c.verified, c.verification_status,
    c.is_available, c.plan, c.avatar_url, c.banner_url,
    c.specializations, c.years_in_business,
    haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8) as distance_miles,
    pcl.pin_lat, pcl.pin_lng, pcl.pin_mode, pcl.service_radius_miles, pcl.area_label
  FROM contractors c
  CROSS JOIN LATERAL public.public_contractor_location(
    c.lat::float8, c.lng::float8, c.service_radius_miles,
    COALESCE(NULLIF(c.location, ''), NULLIF(c.business_city, ''), NULLIF(c.service_area, '')),
    c.show_exact_location, c.has_commercial_address, c.commercial_lat, c.commercial_lng
  ) pcl
  WHERE
    c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND c.is_available = true
    AND c.verification_status = 'approved'
    AND c.profile_published = true
    AND c.show_on_map = true
    AND haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8)
        <= coalesce(c.service_radius_miles::float8, max_miles)
    AND (trade_filter IS NULL OR EXISTS (
      SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = trade_filter
    ))
    AND (specialty_filter IS NULL OR c.specializations @> to_jsonb(array[specialty_filter]))
  ORDER BY distance_miles ASC;
$function$;

REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) TO authenticated;
