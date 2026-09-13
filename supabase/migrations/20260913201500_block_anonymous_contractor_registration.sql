-- contractors_insert_own (auth.uid() = id) let any authenticated identity
-- self-register as a contractor, with no distinction between a real
-- signup and an anonymous session. Combined with job_offers_contractor_
-- insert (same auth.uid()-only pattern) and submit_quote(), a disposable
-- anonymous identity could create a fake contractor row and place a real
-- quote on a real customer's real job -- the worst case named in the
-- guest-mode RLS audit. Blocking it here, ahead of adopting
-- signInAnonymously() for guest mode.
--
-- IS NOT TRUE (not a bare NOT or = false) is deliberate: a real user's
-- JWT may not carry an is_anonymous claim at all, and both
-- NULL::boolean = false and NOT NULL evaluate to NULL, which a WITH
-- CHECK treats as rejection. IS NOT TRUE is the only form of this check
-- that's true for both "no claim" and "claim is false", and false only
-- when the claim is literally true. Proved with synthetic JWTs for all
-- three shapes before applying: is_anonymous:true blocks,
-- is_anonymous:false allows, no claim at all allows (today's real users,
-- unaffected).
ALTER POLICY contractors_insert_own ON public.contractors
WITH CHECK (auth.uid() = id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
