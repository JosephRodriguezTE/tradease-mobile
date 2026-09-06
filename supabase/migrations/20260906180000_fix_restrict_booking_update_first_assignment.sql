-- restrict_booking_update() blocked ALL customer-initiated contractor_id
-- changes, including the very first legitimate assignment (a customer
-- accepting a contractor's quote). lock_booking_on_offer_accepted()'s
-- nested bookings update hit this guard and threw on every single quote
-- acceptance -- job_offers.status never became 'accepted', bookings never
-- confirmed, and neither client (mobile's raw update, website's
-- customer_respond_offer RPC) checked for the error, so it failed
-- silently every time. This is the root cause traced in the job
-- acceptance flow investigation: it explains the customer's screen never
-- updating, the contractor's own "My Quotes" never clearing, and the
-- work-order screen still appearing "live" (that write has no such
-- guard and always succeeds, orphaned from a booking still stuck on
-- 'pending').
--
-- Fix is scoped, not a blanket exemption: first-time assignment
-- (OLD.contractor_id IS NULL) is now allowed only when it matches a real
-- job_offers row for that exact (booking_id, contractor_id) pair.
-- Reassignment (OLD.contractor_id IS NOT NULL) is still unconditionally
-- blocked, unchanged, and the contractor branch is untouched. Without the
-- job_offers check, this fix would let a customer assign an arbitrary
-- contractor_id to their own booking (while keeping status='pending' to
-- stay within customer_update_pending's RLS, which never constrains
-- contractor_id at all) with no quote, no agreed price, no consent from
-- that contractor -- a real spoofing path this same guard was
-- incidentally already blocking today. All three cases verified against
-- the live database before this migration was written: legitimate
-- first-time assignment via a real accepted offer now succeeds
-- atomically; reassignment of an existing contractor still throws;
-- assignment to a contractor with no matching offer still throws.
CREATE OR REPLACE FUNCTION public.restrict_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
-- Contractor cannot reassign customer, reassign contractor, or revert to pending
IF auth.uid() = OLD.contractor_id THEN
IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
RAISE EXCEPTION 'Cannot change customer on a booking';
END IF;
IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
RAISE EXCEPTION 'Cannot reassign contractor';
END IF;
IF NEW.status = 'pending' AND OLD.status != 'pending' THEN
RAISE EXCEPTION 'Cannot revert booking to pending';
END IF;
END IF;
-- Customer cannot reassign an existing contractor, cannot assign a
-- contractor with no matching offer, and cannot steal back a confirmed job
IF auth.uid() = OLD.customer_id THEN
IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
IF OLD.contractor_id IS NOT NULL THEN
RAISE EXCEPTION 'Cannot change contractor on a booking';
ELSIF NEW.contractor_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.job_offers
  WHERE booking_id = OLD.id AND contractor_id = NEW.contractor_id
) THEN
RAISE EXCEPTION 'Cannot assign a contractor without a matching offer';
END IF;
END IF;
IF OLD.status IN ('accepted','confirmed','in_progress') AND NEW.status = 'pending' THEN
RAISE EXCEPTION 'Cannot revert an active booking to pending';
END IF;
END IF;
RETURN NEW;
END;
$function$;
