-- ============================================================================
-- contractors_public leaked phone to any anon/authenticated reader with no
-- relationship required at all -- confirmed live via an unauthenticated
-- anon-key request during the "gate the contractor call button"
-- investigation. Confirmed exhaustively across both repos: exactly 3 readers
-- selected phone from this view (mobile app/company/[id].tsx, website
-- app/contractor/[id]/page.tsx, website
-- app/dashboard/customer/jobs/[id]/page.tsx), all three already guard the
-- call button with `contractor.phone && (...)` -- dropping the column
-- degrades them to "no call button" rather than crashing. Their .select()
-- strings were also updated in the same change to stop naming `phone`
-- explicitly, since PostgREST errors (42703) on a named column that no
-- longer exists, rather than returning null for it.
--
-- Real phone-gating (Tier 3: relationship-scoped access once a real
-- customer<->contractor relationship exists) is a separate mechanism to be
-- designed and built later. This migration only stops the unconditional
-- public leak; it does not add any replacement access path.
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
  COALESCE(array_agg(ct.trade_id) FILTER (WHERE ct.trade_id IS NOT NULL), '{}'::text[]) AS trade_ids
FROM contractors c
LEFT JOIN contractor_trades ct ON ct.contractor_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

GRANT SELECT ON public.contractors_public TO anon, authenticated;
