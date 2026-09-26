-- ============================================================================
-- Extracted from enforce_pre_booking_message_cap()'s inline subquery, so the
-- same "do these two people have a real relationship" predicate can be
-- reused for contact-detail gating (phone/email/location) without a second,
-- possibly-drifting copy of the logic.
--
-- Dropped two dead values found while auditing the original list: 'paid' is
-- not a valid bookings.status at all (confirmed via bookings_status_check --
-- it's a payment_status value); 'accepted' is a valid status per that same
-- constraint but is never actually written -- every UPDATE bookings ...
-- SET status = ... in the whole schema goes straight to 'confirmed' or
-- 'cancelled'. Behavior is otherwise identical.
--
-- Proof: 3 messages from a customer with no booking relationship succeed,
-- the 4th is blocked (PRE_BOOKING_LIMIT_REACHED); once a confirmed booking
-- exists between the same pair, a 5th message succeeds immediately.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_active_booking_relationship(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE status IN ('confirmed', 'in_progress', 'completed')
      AND (
        (customer_id = a AND contractor_id = b) OR
        (customer_id = b AND contractor_id = a)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.enforce_pre_booking_message_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sent_count integer;
BEGIN
  IF NEW.is_system THEN
    RETURN NEW;
  END IF;

  IF public.has_active_booking_relationship(NEW.sender_id, NEW.recipient_id) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO sent_count
  FROM messages
  WHERE chat_id = NEW.chat_id
    AND sender_id = NEW.sender_id
    AND is_system = false;

  IF sent_count >= 3 THEN
    RAISE EXCEPTION 'PRE_BOOKING_LIMIT_REACHED: book this contractor to keep messaging'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
