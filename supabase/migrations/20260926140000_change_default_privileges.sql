-- ============================================================================
-- This project's default privileges granted anon/authenticated full CRUD
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on every
-- new table/view in public, automatically, regardless of any narrower grant
-- issued at creation time. That's exactly what silently granted anon SELECT
-- on users_contact earlier this session despite an explicit
-- `GRANT SELECT ... TO authenticated` -- the default applied independently,
-- on top of it.
--
-- Changed for the postgres role: new tables/views it creates in public no
-- longer auto-grant anything to anon/authenticated. Forward-looking only --
-- does not touch grants already on existing objects.
--
-- Could NOT change it for supabase_admin -- `ALTER DEFAULT PRIVILEGES FOR
-- ROLE supabase_admin` requires being able to assume that role, and postgres
-- cannot (confirmed: pg_has_role('postgres','supabase_admin','MEMBER') =
-- false), the same platform-level wall hit earlier this session with the
-- realtime schema. Nothing in this project's migration history has ever
-- created a public-schema object as supabase_admin, so this gap is believed
-- dormant, not live -- but it's a real, unresolved gap, not a false alarm.
--
-- Also cleaned up the three views built this session, which had all
-- inherited the old excess default (INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER, not just SELECT) despite each one's own migration
-- only ever intending SELECT:
--   - users_public: SELECT for anon + authenticated (intended, unchanged)
--   - contractors_public: SELECT for anon + authenticated (intended, unchanged)
--   - users_contact: SELECT for authenticated only, nothing for anon
--     (already revoked from anon in an earlier migration; this also strips
--     the leftover INSERT/UPDATE/DELETE/etc. that were never revoked)
--
-- Proof: SELECT on users_public still succeeds via the anon key; an INSERT
-- attempt against it (previously allowed by the excess grant) now fails
-- with 42501 permission denied.
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users_public FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contractors_public FROM anon, authenticated;

REVOKE ALL ON public.users_contact FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users_contact FROM authenticated;
