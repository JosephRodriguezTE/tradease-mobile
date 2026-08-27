-- Fix 2 of the payment-auth-gap remediation: save_payment_method,
-- upsert_stripe_customer.
--
-- Both took p_user_id and never checked it against the caller — any
-- authenticated user could overwrite another user's
-- stripe_payment_method_id / stripe_customer_id.
--
-- Per instruction, the parameter is dropped entirely rather than just
-- checked, so it can't be passed wrong: auth.uid() is used directly.
-- CREATE OR REPLACE with a different argument list would have created a
-- second, separate function alongside the vulnerable one rather than
-- replacing it, so the old (uuid, text) signature is explicitly dropped
-- first.
--
-- Also switched SECURITY DEFINER -> SECURITY INVOKER. public.users
-- already has an RLS policy ("Users all own", USING/WITH CHECK
-- auth.uid() = id) covering UPDATE. With the parameter gone, running as
-- SECURITY INVOKER means RLS enforces the same boundary independently of
-- this function's own body, instead of the function being the only
-- layer standing between "any user" and "the right user". This is also
-- the Supabase security advisor's own suggested remediation for this
-- function class (authenticated_security_definer_function_executable).
--
-- Verified no caller anywhere in tradease3 or the companion website repo
-- references either RPC by name — dead from the client's perspective,
-- so this is a pure signature change with nothing to update downstream.
--
-- Verified: two different authenticated sessions (real accounts) each
-- calling with no target parameter only ever touched their own row —
-- the other account's value was untouched. The old (uuid, text) call
-- shape now fails with "function does not exist" (42883), not a
-- permission error — the vulnerable entry point is gone, not just
-- guarded.

DROP FUNCTION IF EXISTS public.save_payment_method(uuid, text);
DROP FUNCTION IF EXISTS public.upsert_stripe_customer(uuid, text);

CREATE FUNCTION public.save_payment_method(p_payment_method_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.users
  SET stripe_payment_method_id = p_payment_method_id
  WHERE id = auth.uid();
END;
$function$;

CREATE FUNCTION public.upsert_stripe_customer(p_stripe_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.users
  SET stripe_customer_id = p_stripe_customer_id
  WHERE id = auth.uid() AND stripe_customer_id IS NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_payment_method(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_stripe_customer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payment_method(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_stripe_customer(text) TO authenticated;
