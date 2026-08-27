-- Fix 1 of the payment-auth-gap remediation: mark_work_order_paid.
--
-- (a) No caller check at all — reachable from any authenticated client via
--     the normal Supabase SDK, with no verification that the caller has
--     anything to do with the work order being marked paid. Real Stripe
--     charge verification isn't possible from inside Postgres without
--     embedding STRIPE_SECRET_KEY here too, which would just relocate the
--     exact secret-handling problem already found in the charge-customer
--     edge function. So: EXECUTE is restricted to service_role. The
--     charge-customer edge function already holds the Stripe key and
--     calls this RPC via its service-role client — that path is
--     unaffected by this change.
--
-- (b) 'approved' and 'paid' are not valid work_order_status enum values —
--     every call to this function threw 22P02 (invalid enum input) for
--     every caller, before this fix, regardless of auth. Corrected to the
--     real state machine per fn_guard_wo_status_transition and
--     validate_work_order_transition, which both only allow
--     payment_releasing -> completed; there is no separate "paid" state,
--     completed is the terminal paid state.
--
-- (c) Added a minimal format check on the payment intent string (must
--     look like a real Stripe id, "pi_..."). Not real verification —
--     that still only happens in charge-customer, which talks to Stripe
--     directly — just catches empty/garbage input even from our own
--     trusted service-role callers.
--
-- Verified: non-owner authenticated caller -> permission denied.
-- Real owner authenticated caller -> also permission denied (correct —
-- no authenticated client should call this directly anymore, owner or
-- not; that's the point of the EXECUTE restriction). service_role caller
-- (matching charge-customer's actual invocation) -> succeeds, row moves
-- payment_releasing -> completed. Malformed PI string -> rejected by (c).

CREATE OR REPLACE FUNCTION public.mark_work_order_paid(
  p_work_order_id uuid,
  p_stripe_payment_intent_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_stripe_payment_intent_id IS NULL OR p_stripe_payment_intent_id !~ '^pi_' THEN
    RAISE EXCEPTION 'Invalid stripe_payment_intent_id format';
  END IF;

  UPDATE public.work_orders
  SET status = 'completed',
      paid_at = NOW(),
      stripe_payment_intent_id = p_stripe_payment_intent_id
  WHERE id = p_work_order_id
    AND status = 'payment_releasing';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_work_order_paid(uuid, text) FROM PUBLIC, anon, authenticated;
