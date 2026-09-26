-- ============================================================================
-- Dropping 4 orphaned views, found during the default-privileges audit.
-- All 4 had anon+authenticated SELECT via this project's default privileges
-- (grants unrelated to whether anything actually reads them). Re-grepped
-- both app repos (code, migrations, edge functions) and queried the live
-- database (pg_proc.prosrc, pg_trigger definitions) for all 4 names before
-- dropping -- zero references in either.
--
-- One near-miss worth recording: booking_calendar appeared in two OLDER
-- migrations (20260922050000, 20260922142145) inside
-- process_account_deletion(), as `DELETE FROM booking_calendar WHERE
-- contractor_id = v_uid OR customer_id = v_uid` -- exploiting the view being
-- a thin, non-aggregated single-table filter over bookings, so a DELETE
-- against it deleted the real underlying row via Postgres's
-- auto-updatable-view rules. That was ALREADY identified and fixed in a
-- later migration (20260922223724_fix_process_account_deletion_booking_calendar_view.sql,
-- applied prior to this session) which replaced it with direct
-- `UPDATE bookings SET customer_name = 'Deleted User' ...` -- confirmed via
-- pg_get_functiondef that the LIVE process_account_deletion() matches that
-- later fix exactly and no longer references booking_calendar at all. The
-- git-grep hit was historical (migrations are a change log, not current
-- state); the live-function check is what confirmed this is actually safe.
--
-- Definitions captured below before dropping.
-- ============================================================================

-- booking_calendar (not used anywhere -- see note above):
-- SELECT id, customer_id, contractor_id, contractor_name, customer_name,
--   trade, booking_date, booking_time, status, description, completed_at,
--   cancelled_at, fee_percent,
--   EXTRACT(year FROM booking_date) AS booking_year,
--   EXTRACT(month FROM booking_date) AS booking_month,
--   EXTRACT(day FROM booking_date) AS booking_day,
--   to_char(booking_date::timestamptz, 'Mon') AS month_short,
--   to_char(booking_date::timestamptz, 'Day') AS day_name
-- FROM bookings b
-- WHERE status <> ALL (ARRAY['cancelled','declined']);
DROP VIEW IF EXISTS public.booking_calendar;

-- contractor_profiles (not used anywhere; duplicated contractors_public's
-- purpose but with phone AND email completely ungated):
-- SELECT c.id, c.company_name, c.trade_type, c.location, c.description,
--   c.rating, c.review_count, c.plan, c.verified, c.approved,
--   c.accepts_bookings, c.avatar_url, c.banner_url, c.portfolio,
--   c.pricing_services, c.insured, c.experience, c.service_areas,
--   c.is_online, c.profile_views, c.total_bookings, c.phone, c.email,
--   c.website, c.pricing_note, c.hourly_rate, u.username, u.full_name,
--   c.created_at
-- FROM contractors c LEFT JOIN users u ON u.id = c.id
-- WHERE c.approved = true;
DROP VIEW IF EXISTS public.contractor_profiles;

-- admin_analytics (not used anywhere; platform-wide revenue/business
-- metrics with no access control at all):
-- SELECT (SELECT count(*) FROM bookings) AS total_bookings,
--   (SELECT count(*) FROM bookings WHERE status = 'completed') AS completed_bookings,
--   (SELECT count(*) FROM bookings WHERE created_at > now() - interval '7 days') AS bookings_this_week,
--   (SELECT count(*) FROM contractors WHERE COALESCE(approved, false) = true) AS approved_contractors,
--   (SELECT count(*) FROM contractors WHERE approval_status = 'pending') AS pending_approvals,
--   (SELECT count(*) FROM users WHERE role = 'customer') AS total_customers,
--   (SELECT COALESCE(sum(platform_fee), 0) FROM payments WHERE status = 'captured') AS total_revenue,
--   (SELECT COALESCE(avg(rating_overall), 0) FROM reviews) AS avg_platform_rating,
--   (SELECT count(*) FROM payments WHERE status = 'disputed') AS open_disputes;
DROP VIEW IF EXISTS public.admin_analytics;

-- refund_summary (not used anywhere; refund reason/amounts + both parties'
-- names joined to the booking, with no access control at all):
-- SELECT rr.id, rr.status, rr.reason, rr.amount_paid, rr.amount_requested,
--   rr.amount_approved, rr.created_at, rr.reviewed_at, b.booking_date,
--   b.booking_time, b.contractor_name, b.customer_name, b.trade
-- FROM refund_requests rr JOIN bookings b ON b.id = rr.booking_id;
DROP VIEW IF EXISTS public.refund_summary;
