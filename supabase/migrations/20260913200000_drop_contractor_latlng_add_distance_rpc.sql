-- Closes the remaining back door from the prior lockdown:
-- contractors_nearby() was rebuilt to never return raw lat/lng, but
-- contractors_public (the view) still exposed them directly -- still
-- SELECT-able by anon -- and create-job.tsx read them raw for its "sort
-- by nearest" feature, entirely bypassing contractors_nearby(). Confirmed
-- live: `SET LOCAL ROLE anon; SELECT * FROM contractors_public LIMIT 1`
-- no longer returns lat/lng after this migration, while every other
-- column (the ones legitimate reads depend on -- company profiles, chat
-- avatars) is unchanged.
--
-- Checked before dropping: no view depends on contractors_public, and
-- the only function referencing it (notify_new_job_posted) selects id
-- only, never lat/lng. CREATE OR REPLACE VIEW can't remove a column from
-- the middle of an existing column list, so this needs DROP+CREATE, same
-- limitation as the function-signature changes earlier in this
-- engagement -- and, discovered while applying this: recreating a
-- dropped view re-triggers the same default-privilege behavior already
-- documented for functions in this project, re-granting anon/
-- authenticated full INSERT/UPDATE/DELETE/TRUNCATE on the new view.
-- Re-pruned in the same migration; confirmed via role_table_grants
-- immediately after.
DROP VIEW IF EXISTS public.contractors_public;

CREATE VIEW public.contractors_public AS
SELECT
  id, username, company_name, company_tag, tagline, trade_type, description,
  experience, years_in_business, specializations, languages, service_area,
  service_areas, service_radius_miles, location, business_city, business_state,
  show_on_map, location_mode, avatar, avatar_url, banner_url, portfolio,
  portfolio_photos, pricing_services, pricing_note, pricing_desc, hourly_rate,
  rating, review_count, total_bookings, response_time_avg, acceptance_rate,
  reliability_score, verified, license_verified, insurance_verified, insured,
  is_online, is_available, accepts_bookings, profile_complete, profile_published,
  created_at, website, plan, verification_status, phone
FROM public.contractors;

-- Re-grant SELECT only -- the actually-used privilege. Not re-granting
-- REFERENCES/TRIGGER (meaningless for a view, were almost certainly
-- leftover from a blanket grant) and explicitly re-revoking the write
-- verbs the default-privilege behavior brings back on every recreate.
GRANT SELECT ON public.contractors_public TO anon;
GRANT SELECT ON public.contractors_public TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contractors_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contractors_public FROM authenticated;

-- Distance-only replacement for create-job.tsx's "sort by nearest".
-- SECURITY DEFINER for the same reason as contractors_nearby() and
-- public_contractor_location(): contractors' own RLS
-- (contractors_select_own_or_admin) only lets a contractor read their own
-- row, so an invoker-rights function could never compute this for anyone
-- else's ids. Returns a scalar distance only, never a coordinate -- same
-- privacy posture as contractors_nearby()'s existing distance_miles
-- field and match_contractors_for_job()'s distance_km. Takes the ids the
-- caller already matched on (specialization query, unchanged) rather
-- than doing any matching itself, so it carries no eligibility filtering
-- of its own by design.
--
-- Proved live: real authenticated session, both real contractors' ids,
-- returned distances matching their known real coordinates (0.30mi and
-- 0.55mi from the test point). anon gets permission denied.
CREATE OR REPLACE FUNCTION public.contractor_distances_miles(
  p_contractor_ids uuid[],
  user_lat double precision,
  user_lng double precision
)
RETURNS TABLE(id uuid, distance_miles double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8)
  FROM contractors c
  WHERE c.id = ANY(p_contractor_ids)
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.contractor_distances_miles(uuid[], double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_distances_miles(uuid[], double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_distances_miles(uuid[], double precision, double precision) TO authenticated;
