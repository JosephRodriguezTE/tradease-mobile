-- Root cause of the contractor job feed / job detail bug: bookings RLS
-- only grants SELECT to the booking's customer or its assigned
-- contractor (bookings_owner_or_assigned_contractor_select: auth.uid()
-- = customer_id OR auth.uid() = contractor_id). Verified live before
-- writing this: a genuine non-admin, non-assigned contractor querying
-- bookings directly for a pending, unclaimed job (contractor_id IS
-- NULL) gets zero rows, since neither side of that OR can ever match.
-- contractor-home.tsx's Live Job Feed and job/[id].tsx's detail query
-- both queried bookings directly -- only the map screen already knew
-- to route through public_jobs_nearby() instead.
--
-- public_jobs_nearby() already existed and was already correctly
-- fuzzing location and omitting customer identity. It just didn't
-- return description -- checked real data first: description holds
-- the customer's actual job text ("AC Installation: Need a full home
-- AC installation ASAP..."), no address, no identity, safe to add.
-- notes was checked too and deliberately NOT added: real rows show it
-- holds freeform address text customers typed in ("7 Andover Court,
-- Commack, New York 11725", "Garden City, Nassau") -- exactly the risk
-- it looked like it might be.
--
-- is_instant_book and instant_book_price were already being returned;
-- the mobile app's own NearbyJob TS type on the map screen just never
-- declared them, so contractor-home.tsx's port of this function
-- inherited an incomplete picture of what it already had access to.
--
-- CREATE OR REPLACE can't add a new output column to an existing
-- RETURNS TABLE (Postgres treats that as a return-type change), hence
-- the DROP first.
DROP FUNCTION IF EXISTS public.public_jobs_nearby(double precision, double precision, double precision, text);

CREATE FUNCTION public.public_jobs_nearby(user_lat double precision, user_lng double precision, max_miles double precision DEFAULT 50, trade_filter text DEFAULT NULL::text)
RETURNS TABLE(id uuid, trade text, description text, urgency text, status text, price_estimate integer, created_at timestamp with time zone, request_expires_at timestamp with time zone, fuzzed_lat double precision, fuzzed_lng double precision, town text, nearest_major_road text, is_instant_book boolean, instant_book_price integer)
LANGUAGE sql
STABLE SECURITY DEFINER
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
    b.instant_book_price
  FROM public.bookings b
  CROSS JOIN LATERAL public.fuzz_point(b.id, b.job_lat::double precision, b.job_lng::double precision, 600) fz
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

-- public_job_by_id(): companion for job/[id].tsx. A browsing contractor
-- arrives with a specific job id already in hand (map pin tap, push
-- notification deep link) -- reusing public_jobs_nearby itself would
-- mean requiring the device's current location just to look up one
-- already-known id, and picking an arbitrarily large max_miles to
-- guarantee the target row is even in range. Same eligibility
-- predicate, same fuzzing, keyed by id instead of geo-radius.
CREATE FUNCTION public.public_job_by_id(job_id uuid)
RETURNS TABLE(id uuid, trade text, description text, urgency text, status text, price_estimate integer, created_at timestamp with time zone, request_expires_at timestamp with time zone, fuzzed_lat double precision, fuzzed_lng double precision, town text, nearest_major_road text, is_instant_book boolean, instant_book_price integer)
LANGUAGE sql
STABLE SECURITY DEFINER
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
    b.instant_book_price
  FROM public.bookings b
  CROSS JOIN LATERAL public.fuzz_point(b.id, b.job_lat::double precision, b.job_lng::double precision, 600) fz
  WHERE b.id = job_id
    AND b.status = 'pending'
    AND b.contractor_id IS NULL
    AND b.is_public = true
    AND (b.request_expires_at IS NULL OR b.request_expires_at > now())
    AND b.job_lat IS NOT NULL
    AND b.job_lng IS NOT NULL;
$function$;

-- NOTE on a mistake made and corrected while applying this migration:
-- the DROP+CREATE above triggers this project's default privileges --
-- new functions in public auto-grant EXECUTE to anon/authenticated/
-- service_role as explicit named-role grants, not through the PUBLIC
-- pseudo-role. A bare `REVOKE ALL ... FROM PUBLIC` does not touch an
-- explicit grant to a named role, so the first pass of this migration
-- left anon with EXECUTE on both functions -- confirmed by querying
-- information_schema.routine_privileges immediately after, which is
-- exactly why that check is worth doing on every new function, not
-- just assumed. The original public_jobs_nearby was authenticated-only
-- before any of this (checked before touching it). Explicit REVOKE
-- FROM anon below restores that; unauthenticated access would mean
-- anyone without an account could scrape open job postings, fuzzed or
-- not. search_path is also pinned, matching the pattern already used
-- on this project's other SECURITY DEFINER functions (accept_job,
-- _finalize_job_acceptance) -- not retrofitting the ~85 other
-- pre-existing functions the security advisor flags with the same
-- mutable-search-path gap, that's a separate, systemic cleanup.
REVOKE ALL ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) TO authenticated;
ALTER FUNCTION public.public_jobs_nearby(double precision, double precision, double precision, text) SET search_path = 'public';

REVOKE ALL ON FUNCTION public.public_job_by_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.public_job_by_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.public_job_by_id(uuid) TO authenticated;
ALTER FUNCTION public.public_job_by_id(uuid) SET search_path = 'public';
