-- Confirmed before building this: no expiry sweep existed anywhere --
-- the only cron job in this project is auto-approve-work-orders,
-- unrelated. expires_at/counter_expires_at were only ever checked
-- lazily, inside customer_respond_offer, and only when the customer
-- actually tapped Accept/Decline/Counter. A quote nobody ever acted on
-- sat at status='quoted' forever -- no notification, no state change.
--
-- Sweeps both halves of the lifecycle: a plain quote past expires_at,
-- and a countered offer past counter_expires_at (the customer's
-- counter also needs a contractor response by a deadline -- same
-- dead-quote problem). Notifies both sides on every row it flips,
-- using the same public.notifications insert pattern already used
-- elsewhere (notify_customer_on_status, etc.) -- the
-- on_notification_send_push trigger on that table handles actually
-- delivering the push, so this function doesn't need to know anything
-- about that.
CREATE OR REPLACE FUNCTION public.sweep_expired_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer RECORD;
  v_booking public.bookings;
  v_contractor_name text;
BEGIN
  FOR v_offer IN
    SELECT * FROM public.job_offers
    WHERE (status = 'quoted' AND expires_at IS NOT NULL AND expires_at <= NOW())
       OR (status = 'countered' AND counter_expires_at IS NOT NULL AND counter_expires_at <= NOW())
  LOOP
    UPDATE public.job_offers SET status = 'expired' WHERE id = v_offer.id;

    SELECT * INTO v_booking FROM public.bookings WHERE id = v_offer.booking_id;
    SELECT company_name INTO v_contractor_name FROM public.contractors WHERE id = v_offer.contractor_id;

    IF v_booking.customer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, booking_id, data)
      VALUES (
        v_booking.customer_id,
        '⏱ Quote Expired',
        COALESCE(v_contractor_name, 'A contractor') || '''s quote on your ' ||
          COALESCE(v_booking.trade, 'job') || ' job expired without a response. The job is open again.',
        'quote_expired',
        v_offer.booking_id,
        jsonb_build_object('offer_id', v_offer.id, 'trade', v_booking.trade)
      );
    END IF;

    IF v_offer.contractor_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, booking_id, data)
      VALUES (
        v_offer.contractor_id,
        '⏱ Quote Expired',
        'Your quote on the ' || COALESCE(v_booking.trade, '') || ' job went unanswered and expired.',
        'quote_expired',
        v_offer.booking_id,
        jsonb_build_object('offer_id', v_offer.id, 'trade', v_booking.trade)
      );
    END IF;
  END LOOP;
END;
$function$;

-- Cron-only, like sweep_auto_approve_work_orders -- never meant to be
-- called by a client. Explicit REVOKE of anon/authenticated/PUBLIC
-- included in this same migration this time (previous new-function
-- migrations needed a separate follow-up after catching the default-
-- privilege grant live) -- confirmed clean via
-- information_schema.routine_privileges immediately after applying:
-- postgres and service_role only.
REVOKE ALL ON FUNCTION public.sweep_expired_quotes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_quotes() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_quotes() FROM authenticated;

SELECT cron.schedule('sweep-expired-quotes', '*/15 * * * *', 'SELECT public.sweep_expired_quotes()');
