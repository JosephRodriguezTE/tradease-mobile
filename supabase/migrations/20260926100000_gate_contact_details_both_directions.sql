-- ============================================================================
-- Contact-detail gating, both directions, keyed on the same
-- has_active_booking_relationship() predicate the message cap uses.
--
-- Mechanism: a view with a per-viewer CASE expression, not RLS alone. RLS is
-- row-level -- it can't express "this column of this row, but not that one."
-- A relationship-based clause on users' own RLS would let anyone with an
-- active booking read every column via plain select(*), including
-- stripe_customer_id, push_token, two_factor_phone. Views bypass the base
-- table's RLS entirely (same mechanism already relied on for
-- contractors_public/users_public), so gating column-by-column inside the
-- view is the only way to get the precision this needs.
--
-- Customer side: contractors_public.phone comes back, computed per-viewer --
-- NULL unless auth.uid() has a real booking relationship with that
-- contractor. Anonymous requests always get NULL (auth.uid() is null).
--
-- Contractor side: a new users_contact view exposes phone/email/location for
-- another person's row, gated the same way. created_at folded in alongside
-- them (same gate) for the "Member since" display on
-- dashboard/contractor/jobs/[id]/page.tsx, rather than left on a path that
-- breaks once the base users policy is narrowed next.
--
-- Note: this project has default privileges granting anon/authenticated
-- broad access to every new public-schema object, which silently granted
-- anon SELECT on users_contact despite only `authenticated` being named in
-- the GRANT below -- caught live via the anon key (got a row back, phone
-- correctly null, but readable at all). Explicitly revoked; anon now gets a
-- clean 42501 permission-denied instead of relying solely on the CASE
-- expression to keep it safe.
-- ============================================================================

DROP VIEW IF EXISTS public.contractors_public;

CREATE VIEW public.contractors_public AS
SELECT
  c.id,
  c.username,
  c.company_name,
  c.company_tag,
  c.tagline,
  c.trade_type,
  c.description,
  c.experience,
  c.years_in_business,
  c.specializations,
  c.languages,
  c.service_area,
  c.service_areas,
  c.service_radius_miles,
  c.location,
  c.business_city,
  c.business_state,
  c.show_on_map,
  c.location_mode,
  c.avatar,
  c.avatar_url,
  c.banner_url,
  c.portfolio,
  c.portfolio_photos,
  c.pricing_services,
  c.pricing_note,
  c.pricing_desc,
  c.hourly_rate,
  c.rating,
  c.review_count,
  c.total_bookings,
  c.response_time_avg,
  c.acceptance_rate,
  c.reliability_score,
  c.verified,
  c.license_verified,
  c.insurance_verified,
  c.insured,
  c.is_online,
  c.is_available,
  c.accepts_bookings,
  c.profile_complete,
  c.profile_published,
  c.created_at,
  c.website,
  c.plan,
  c.verification_status,
  CASE WHEN public.has_active_booking_relationship(auth.uid(), c.id) THEN c.phone ELSE NULL END AS phone,
  COALESCE(array_agg(ct.trade_id) FILTER (WHERE ct.trade_id IS NOT NULL), '{}'::text[]) AS trade_ids
FROM contractors c
LEFT JOIN contractor_trades ct ON ct.contractor_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

GRANT SELECT ON public.contractors_public TO anon, authenticated;

CREATE VIEW public.users_contact AS
SELECT
  id,
  CASE WHEN public.has_active_booking_relationship(auth.uid(), id) THEN phone ELSE NULL END AS phone,
  CASE WHEN public.has_active_booking_relationship(auth.uid(), id) THEN email ELSE NULL END AS email,
  CASE WHEN public.has_active_booking_relationship(auth.uid(), id) THEN location ELSE NULL END AS location,
  CASE WHEN public.has_active_booking_relationship(auth.uid(), id) THEN created_at ELSE NULL END AS created_at
FROM public.users
WHERE deleted_at IS NULL;

GRANT SELECT ON public.users_contact TO authenticated;
REVOKE SELECT ON public.users_contact FROM anon;
