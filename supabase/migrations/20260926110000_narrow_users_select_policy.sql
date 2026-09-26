-- ============================================================================
-- The last step: narrow public.users' SELECT policy away from USING (true),
-- which granted every column (phone, email, lat/lng, stripe_customer_id,
-- stripe_payment_method_id, two_factor_phone, push_token, everything) to any
-- anon or authenticated request for any row -- confirmed live via an
-- unauthenticated anon-key request that pulled the whole table.
--
-- Deliberately NOT adding a relationship clause here (e.g.
-- has_active_booking_relationship(auth.uid(), id)) even though that
-- predicate exists now -- that would let anyone with an active booking read
-- every column of the other party's row via a plain raw-table select(*),
-- including fields never intended to be relationship-exposed. That's the
-- RLS-is-row-level-not-column-level problem the contact-gating views exist
-- to avoid. Both legitimate broad needs are already served by views that
-- bypass this policy entirely (same mechanism contractors_public has always
-- used): users_public (name/avatar, anyone) and users_contact
-- (phone/email/location/created_at, relationship-gated). Narrowing the base
-- table to "own row, or admin" doesn't take anything away from either view.
--
-- The admin check needed its own function (is_admin()), not an inline
-- subquery -- the first attempt (a correlated EXISTS against public.users
-- directly in this same table's policy) hit 42P17 "infinite recursion
-- detected in policy for relation users", since the subquery is itself
-- subject to this same policy. contractors_select_own_or_admin uses the
-- identical inline shape safely only because it's a DIFFERENT table's policy
-- checking users, not a self-reference. is_admin() is SECURITY DEFINER, so
-- its internal lookup bypasses RLS on users the same way the views do,
-- avoiding the recursion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = uid AND is_admin = true);
$function$;

DROP POLICY IF EXISTS "Public read users for display" ON public.users;
DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;

CREATE POLICY "users_select_own_or_admin" ON public.users
FOR SELECT
USING (
  auth.uid() = id
  OR public.is_admin(auth.uid())
);
