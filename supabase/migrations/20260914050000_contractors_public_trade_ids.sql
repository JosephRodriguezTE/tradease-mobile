-- Phase 3: the read-path repoint. Six website screens filter
-- contractors_public with .ilike('trade_type', ...) -- substring match
-- against the single denormalized primary-trade cache column, so a
-- multi-trade contractor only ever surfaces on their primary trade's
-- page. contractors_nearby() already solves this correctly but can't
-- serve these screens: the ISR SEO pages (/contractors/[trade],
-- /contractors/[trade]/[city]) have no user coordinates at
-- build/revalidate time, and separately, an anonymous visitor resolves
-- to the anon role, which contractors_nearby() has no grant for at all
-- (authenticated/postgres/service_role only). The two authenticated
-- pages (find-contractors, book's live-count/preview) don't collect
-- geolocation today; forcing that would be a new requirement, not a fix.
--
-- Fix: add trade_ids, an aggregated array of every trade a contractor
-- is assigned (not just the primary), to contractors_public itself.
-- CREATE OR REPLACE VIEW only requires the existing columns keep their
-- names/types/order -- appending one trailing column is legal and
-- carries over the view's existing grants unchanged (verified below),
-- so every call site's .select() list, sort, and pagination logic is
-- untouched; only the trade filter itself changes,
-- .ilike('trade_type', '%X%') -> .contains('trade_ids', ['X']).
--
-- GROUP BY c.id alone (not all 46 columns) is valid here because id is
-- contractors' primary key -- Postgres recognizes the functional
-- dependency and allows selecting the rest of that table's columns
-- unaggregated.
CREATE OR REPLACE VIEW public.contractors_public AS
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
  c.phone,
  COALESCE(array_agg(ct.trade_id) FILTER (WHERE ct.trade_id IS NOT NULL), '{}'::text[]) AS trade_ids
FROM public.contractors c
LEFT JOIN public.contractor_trades ct ON ct.contractor_id = c.id
GROUP BY c.id;
