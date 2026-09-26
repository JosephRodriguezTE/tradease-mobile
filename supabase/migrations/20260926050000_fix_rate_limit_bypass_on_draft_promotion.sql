-- ============================================================================
-- enforce_booking_rate_limit was BEFORE INSERT only, counting created_at.
-- Saving a draft is an INSERT, so rapid draft creation was already capped --
-- but promoting a draft to pending is an UPDATE, which this trigger never
-- saw. A customer could bank drafts slowly (spread out over hours/days,
-- never tripping the 10-minute insert window) then promote a large batch
-- of them to pending within seconds, with no check at all on that burst.
--
-- Fix: a second trigger on the draft/declined -> pending transition (the
-- same transition on_booking_pending_transition and this migration's
-- companion triggers already key on -- a declined direct request reposted
-- publicly goes through the same path and is correctly included).
--
-- The promotion-side count needed a marker for "when did this booking
-- actually reach pending" that isn't influenced by unrelated edits.
-- updated_at was considered and rejected: it's bumped by any update to the
-- row (trg_bookings_updated_at fires on every UPDATE), so an unrelated
-- edit to an already-pending booking would inflate the count. No existing
-- column tracks this (confirmed via information_schema against the full
-- column list -- confirmed_at/accepted_at/scheduled_at/completed_at all
-- mark different transitions). Added posted_at, set only inside this same
-- trigger function, only when NEW.status = 'pending' -- covering both a
-- fresh insert-as-pending and a promotion uniformly, and left untouched by
-- any update that doesn't actually transition a row into pending (the
-- promotion trigger's WHEN clause means this function isn't even invoked
-- for those).
--
-- The original INSERT-side check (created_at, counts all rows regardless
-- of status) is unchanged -- it caps raw row creation, which was not
-- reported as broken. The new posted_at-side check is a second, additive
-- condition scoped to NEW.status = 'pending', independent of TG_OP.
-- ============================================================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS posted_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Unchanged: caps raw row creation (any status) per customer, per 10 min.
  IF TG_OP = 'INSERT' THEN
    IF (
      SELECT count(*) FROM public.bookings
      WHERE customer_id = NEW.customer_id
        AND created_at > now() - interval '10 minutes'
    ) >= 3 THEN
      RAISE EXCEPTION 'Too many job postings in a short time — please wait a few minutes and try again.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- New: caps how many bookings actually reached pending recently, for
  -- this customer, whether by fresh insert-as-pending or by draft/declined
  -- promotion. Counted on posted_at, set only here, only when a booking
  -- reaches pending -- exact, not a proxy off updated_at, and untouched by
  -- unrelated edits to an already-pending booking.
  IF NEW.status = 'pending' THEN
    IF (
      SELECT count(*) FROM public.bookings
      WHERE customer_id = NEW.customer_id
        AND posted_at > now() - interval '10 minutes'
    ) >= 3 THEN
      RAISE EXCEPTION 'Too many job postings in a short time — please wait a few minutes and try again.' USING ERRCODE = 'P0001';
    END IF;

    NEW.posted_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_booking_rate_limit_on_promotion ON public.bookings;
CREATE TRIGGER enforce_booking_rate_limit_on_promotion
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IN ('draft','declined') AND NEW.status = 'pending')
EXECUTE FUNCTION enforce_booking_rate_limit();
