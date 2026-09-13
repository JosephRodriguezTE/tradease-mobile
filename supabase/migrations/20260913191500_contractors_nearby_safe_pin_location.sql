-- Port of publicContractorLocation() (lib/map/location-privacy.ts) to SQL,
-- mirroring fuzz_point()'s existing pattern for jobs: pure computation, no
-- table access, same decision logic as the TS spec it's ported from.
-- Default is the service-area center (a point the contractor's location
-- lives at today, not one they've deliberately chosen -- see report).
-- Storefront mode requires show_exact_location AND has_commercial_address
-- AND an actual commercial coordinate, all three, same as the TS version.
--
-- Proved directly (no table writes needed -- pure function, scalar args):
-- every combination of the two flags with/without a commercial coordinate
-- resolves to 'service_area' except all-three-true, which resolves to
-- 'storefront' with the commercial coordinate, null radius, and a bare
-- area label instead of "Serves X and nearby".
CREATE OR REPLACE FUNCTION public.public_contractor_location(
  p_lat double precision,
  p_lng double precision,
  p_service_radius_miles numeric,
  p_area_name text,
  p_show_exact_location boolean,
  p_has_commercial_address boolean,
  p_commercial_lat double precision,
  p_commercial_lng double precision
)
RETURNS TABLE(
  pin_lat double precision,
  pin_lng double precision,
  pin_mode text,
  service_radius_miles numeric,
  area_label text
)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT
    CASE WHEN x.exact_allowed THEN p_commercial_lat ELSE p_lat END,
    CASE WHEN x.exact_allowed THEN p_commercial_lng ELSE p_lng END,
    CASE WHEN x.exact_allowed THEN 'storefront' ELSE 'service_area' END,
    CASE WHEN x.exact_allowed THEN NULL::numeric ELSE p_service_radius_miles END,
    CASE WHEN x.exact_allowed THEN COALESCE(p_area_name, 'this area')
         ELSE 'Serves ' || COALESCE(p_area_name, 'this area') || ' and nearby' END
  FROM (
    SELECT p_show_exact_location AND p_has_commercial_address
      AND p_commercial_lat IS NOT NULL AND p_commercial_lng IS NOT NULL AS exact_allowed
  ) x;
$function$;

REVOKE ALL ON FUNCTION public.public_contractor_location(double precision, double precision, numeric, text, boolean, boolean, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_contractor_location(double precision, double precision, numeric, text, boolean, boolean, double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_contractor_location(double precision, double precision, numeric, text, boolean, boolean, double precision, double precision) TO authenticated;

-- contractors_nearby() rebuild. Previously LANGUAGE sql STABLE (no
-- SECURITY DEFINER), reading contractors_public and returning raw lat/lng
-- unconditionally -- no show_on_map check, no storefront/service-area
-- distinction (couldn't have had one: contractors_public doesn't expose
-- show_exact_location/has_commercial_address/commercial_lat/commercial_lng
-- at all). Needs DROP first: Postgres can't change a RETURNS TABLE shape
-- via CREATE OR REPLACE.
--
-- Now SECURITY DEFINER, reading the base contractors table directly --
-- required, not optional: contractors' own RLS
-- (contractors_select_own_or_admin) only lets a contractor read their own
-- row or an admin read any row, so an invoker-rights function could never
-- see other contractors' data to begin with. Same reason
-- public_jobs_nearby() is SECURITY DEFINER against bookings.
--
-- area_label source: business_city was the planned primary, but the real
-- data disagreed -- the one contractor who actually shows today has
-- business_city='New York' (their broad registered city) and
-- location='Commack' (the actual town they work in, the meaningful one
-- for "N electricians cover X" copy). location is what public_jobs_nearby
-- distinguishes on too (via town/nearest_major_road). Fallback chain is
-- therefore location -> business_city -> service_area -> 'this area'
-- (the last step lives inside public_contractor_location itself).
--
-- Proved live, real contractor, real session: pin_mode='service_area',
-- area_label='Serves Commack and nearby', pin_lat/lng matching stored
-- lat/lng, distance_miles unaffected. Grants confirmed clean via
-- information_schema.routine_privileges on both functions: authenticated/
-- postgres/service_role only, no anon, no PUBLIC.
DROP FUNCTION IF EXISTS public.contractors_nearby(double precision, double precision, double precision, text, text);

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
    AND (trade_filter IS NULL OR c.trade_type ILIKE '%' || trade_filter || '%')
    AND (specialty_filter IS NULL OR c.specializations @> to_jsonb(array[specialty_filter]))
  ORDER BY distance_miles ASC;
$function$;

REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) TO authenticated;
