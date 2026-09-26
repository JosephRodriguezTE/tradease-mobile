-- ============================================================================
-- payment_waitlist had RLS enabled with zero policies. Website's
-- PaymentsSection.tsx ('use client', regular browser client) does
-- supabase.from('payment_waitlist').insert({ user_id, email, role }) for the
-- "Join Waitlist" button -- silently rejected for every real user until now.
--
-- Proof: anon (no session) still correctly blocked (auth.uid() is null,
-- never matches user_id). As the authenticated user themselves, the exact
-- insert the button performs succeeds, and reading it back via SELECT
-- returns the row. A second, unrelated authenticated user querying the
-- first user's row gets zero results.
-- ============================================================================

CREATE POLICY "waitlist_insert_own" ON public.payment_waitlist
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "waitlist_select_own" ON public.payment_waitlist
FOR SELECT
USING (auth.uid() = user_id);
