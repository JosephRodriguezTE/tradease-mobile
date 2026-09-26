-- ============================================================================
-- email_on_new_job_posted() and broadcast_new_job_lead() are AFTER INSERT
-- only, same gap notify_new_job_posted() had before its own AFTER UPDATE
-- companion (on_booking_pending_transition). Now that the leak fix makes
-- "Find a Contractor" always save a draft first, a plain "Post Job" reached
-- by resuming that draft is now the common path, not the edge case -- and
-- it was silently emailing nobody and broadcasting nothing.
--
-- Confirmed both functions read only NEW, never OLD -- safe to bind
-- unmodified to a second trigger; no function body changes needed here.
--
-- Neither function's WHEN clause checks request_mode, but both functions'
-- own bodies already guard on NEW.contractor_id IS NULL (email_on_new_job_posted)
-- and NEW.contractor_id IS NULL AND NEW.is_public = true (broadcast_new_job_lead)
-- -- so a direct request promoted from draft to pending still triggers
-- neither, structurally, regardless of which trigger fired it.
--
-- Unrelated discovery made while proving this migration, NOT fixed here:
-- realtime.messages is a native partitioned table with no partition beyond
-- 2026-09-24, and no job (pg_cron or otherwise) creates future ones. Every
-- call to realtime.send() has been silently failing since 2026-09-25 --
-- caught internally by realtime.send()'s own `EXCEPTION WHEN OTHERS THEN
-- RAISE WARNING`, so the triggering statement always succeeds and nothing
-- surfaces. This affects the pre-existing trg_broadcast_new_job_lead
-- (AFTER INSERT) exactly as much as the new trigger added below -- it is
-- not caused by this migration. Creating the missing partition requires
-- privileges the `postgres` role does not have on schema `realtime`
-- (owned by supabase_admin/supabase_realtime_admin); this needs Supabase
-- support or dashboard intervention, not a migration. Reported separately.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_email_new_job_posted_from_draft ON public.bookings;
CREATE TRIGGER trg_email_new_job_posted_from_draft
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'pending')
EXECUTE FUNCTION email_on_new_job_posted();

DROP TRIGGER IF EXISTS trg_broadcast_new_job_lead_from_draft ON public.bookings;
CREATE TRIGGER trg_broadcast_new_job_lead_from_draft
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'pending')
EXECUTE FUNCTION broadcast_new_job_lead();
