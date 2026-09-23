-- mark_work_order_paid() silently succeeded even when its UPDATE matched
-- zero rows (e.g. called against a work order not at 'payment_releasing').
-- charge-customer never checked this either, so a stale/mismatched call
-- looked identical to a real success. Fail loudly instead.

CREATE OR REPLACE FUNCTION public.mark_work_order_paid(p_work_order_id uuid, p_stripe_payment_intent_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
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

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'mark_work_order_paid: no row updated for work_order_id=% (not at payment_releasing, or does not exist)', p_work_order_id;
  END IF;
END;
$function$;
