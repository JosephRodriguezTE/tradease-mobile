-- ============================================================================
-- Tier 2 of closing the public.users "Public read users for display" leak
-- (USING (true), granted to anon+authenticated -- exposes phone, email,
-- lat/lng, Stripe IDs, everything, to anyone, confirmed live via an
-- unauthenticated anon-key request).
--
-- Narrow view exposing only display fields, so every legitimate "show me
-- this other person's name/avatar" call site (chat, reviews, referrals) has
-- something safe to read from before the base policy gets narrowed (Tier 3,
-- deliberately not done here).
-- ============================================================================

CREATE VIEW public.users_public AS
SELECT id, full_name, avatar_url
FROM public.users
WHERE deleted_at IS NULL;

GRANT SELECT ON public.users_public TO anon, authenticated;
