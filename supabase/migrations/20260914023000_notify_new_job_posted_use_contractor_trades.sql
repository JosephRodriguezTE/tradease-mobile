-- Phase 1, function 3 of 4. The main branch (job has coordinates)
-- already calls contractors_nearby() and inherited the trades fix for
-- free in that migration -- untouched here. Only the no-coordinates
-- fallback branch had its own inline
-- `c.trade_type ilike '%' || NEW.trade || '%'` against contractors_public,
-- changed to the same EXISTS membership check against contractor_trades.
--
-- Proved live via the fallback branch specifically (a real test booking
-- with job_lat/job_lng null): trade='Electrical' correctly notified the
-- real multi-trade contractor (1442f0ec); trade='Plumbing' (a trade they
-- don't have) correctly generated zero notifications for them. Test
-- bookings and notifications deleted, zero remaining. Grants confirmed
-- clean: trigger-only, no client execute.
CREATE OR REPLACE FUNCTION public.notify_new_job_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NULL AND NEW.status = 'pending' THEN
    IF NEW.job_lat IS NOT NULL AND NEW.job_lng IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT n.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — ' ||
          CASE WHEN NEW.price_estimate IS NOT NULL THEN 'Est. $' || NEW.price_estimate::TEXT ELSE 'Price TBD' END,
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_nearby(NEW.job_lat::float8, NEW.job_lng::float8, 50, NEW.trade, NULL) n;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
      SELECT c.id, 'new_job_nearby',
        '🔥 New ' || COALESCE(NEW.trade,'Job') || ' Nearby',
        COALESCE(NEW.job_address,'Near you') || ' — ' ||
          CASE WHEN NEW.price_estimate IS NOT NULL THEN 'Est. $' || NEW.price_estimate::TEXT ELSE 'Price TBD' END,
        jsonb_build_object('booking_id',NEW.id,'trade',NEW.trade),
        'flash-outline', NEW.customer_name
      FROM public.contractors_public c
      WHERE c.is_available = true
        AND c.verification_status = 'approved'
        AND c.profile_published = true
        AND (NEW.trade IS NULL OR EXISTS (
          SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = NEW.trade
        ));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_new_job_posted() FROM PUBLIC, anon, authenticated;
