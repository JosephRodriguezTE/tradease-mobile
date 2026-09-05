-- Consistency polish, not a bug fix: the em-dash fallback ("Est. $—")
-- from the Sept 2 migration was already correct and live, but reads
-- oddly next to a dollar sign. This repo already has an established
-- convention for "no price yet" (match-job, notify-nearby-contractors
-- both use 'Price TBD') -- matching it here instead of a bare dash.
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
        AND (NEW.trade IS NULL OR c.trade_type ilike '%' || NEW.trade || '%');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
