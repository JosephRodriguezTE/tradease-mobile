-- ============================================================================
-- bookings_request_mode_check didn't allow 'direct' -- caught by end-to-end
-- proof testing, not by code review. Every client-side write introduced in
-- this feature (create-job.tsx, website create-job/page.tsx,
-- find-contractor.tsx's attach-on-select) sets request_mode: 'direct', and
-- every one of them would have been rejected by this constraint in
-- production. notify_new_job_posted(), restrict_booking_update(),
-- handle_cancellation_and_reassign(), and notify_booking_status_supplemental()
-- all already reference 'direct' as a real value -- only the CHECK
-- constraint itself was never updated to allow it.
-- ============================================================================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_request_mode_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_request_mode_check
  CHECK (((request_mode IS NULL) OR (request_mode = ANY (ARRAY['request'::text, 'post'::text, 'direct'::text]))));
