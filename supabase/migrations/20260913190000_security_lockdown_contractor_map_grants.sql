-- Priority fix, applied before anything else in this batch of work:
-- contractors_nearby() was LANGUAGE sql STABLE (not SECURITY DEFINER) with
-- EXECUTE granted to PUBLIC and anon. Anyone holding the anon API key --
-- no session, no signup -- could call it directly and get back every
-- approved contractor's stored lat/lng. Confirmed live: `SET LOCAL ROLE
-- anon; SELECT * FROM contractors_nearby(...)` succeeded before this
-- migration and returns `permission denied for function` after it.
--
-- Matches the precedent already set for jobs
-- (restrict_public_jobs_nearby_to_authenticated). Known, accepted
-- consequence: app/(tabs)/map.tsx's guest mode (a real, client-side-only
-- mode with no Supabase session -- see hooks/useAuth.ts) calls this RPC
-- under the bare anon key and will now get a permission error instead of
-- results. Flagged for the client-side phase of this work, not fixed here.
REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractors_nearby(double precision, double precision, double precision, text, text) FROM anon;

-- contractors_public (a view) had anon and authenticated granted INSERT/
-- UPDATE/DELETE/TRUNCATE -- write verbs against a read-only public view,
-- almost certainly an unpruned blanket grant. SELECT is deliberately left
-- alone here: several legitimate authenticated reads depend on it
-- (company profiles, chat avatars, create-job's matched-contractor list).
-- Note SELECT itself is a separate, still-open gap: contractors_public
-- exposes raw lat/lng and create-job.tsx already reads it directly
-- (bypassing contractors_nearby entirely, for its "sort by nearest"
-- feature) -- pruning that is a client-side decision, not a plain revoke,
-- so it's out of scope for this migration. See the engagement report.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contractors_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contractors_public FROM authenticated;
