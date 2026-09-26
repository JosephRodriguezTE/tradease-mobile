-- ============================================================================
-- specialty_pricing had RLS enabled with zero policies. Mobile's
-- create-job.tsx (a signed-in-user flow) does
-- supabase.from('specialty_pricing').select('price_min, price_max,
-- price_common, unit')... to show pricing guidance while a customer
-- describes a job -- silently returned nothing (not an error) for every
-- real user until now.
--
-- Checked both repos: only consumer is create-job.tsx, behind auth. The
-- website has zero references anywhere -- no marketing-site use case needs
-- anon access, so authenticated-only. Pure reference data, no per-user
-- ownership column, so a blanket read is the right shape.
--
-- Proof: as an authenticated user, the exact query create-job.tsx runs
-- (filtered by trade + specialty) returns real pricing data. Anon still
-- gets an empty result, as intended.
-- ============================================================================

CREATE POLICY "specialty_pricing_read_authenticated" ON public.specialty_pricing
FOR SELECT
TO authenticated
USING (true);
