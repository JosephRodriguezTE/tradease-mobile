# Database migrations (up to 2026-09-26)

This folder holds the shared Supabase project's migrations up to 2026-09-26.
**New migrations live in the website repo** (`supabase/migrations/` there),
along with the rules for writing them — read its `README.md` first.

The rule that matters most: since 2026-10-04 a new function is not executable
by `anon` or `authenticated` until a migration grants it. Every new RPC needs an
explicit `GRANT EXECUTE … TO authenticated` (and `anon` for logged-out callers),
and so does every helper a view or RLS policy calls — the Sept 28 profile 404s
(`has_active_booking_relationship()` inside `contractors_public.phone`) and the
`send_email()` exposure are the two examples, written up in the website repo's
README.
