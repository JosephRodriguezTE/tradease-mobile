-- Server-side backstop for the 3-message pre-booking cap.
-- Mirrors app/chat/[id].tsx's client-side rule exactly (PRE_BOOKING_LIMIT = 3,
-- lines ~30 and ~167-169): a sender may send at most 3 non-system messages to
-- a given recipient (scoped by chat_id) unless an active booking already
-- exists between them. Additive only — new function + new trigger, nothing
-- existing altered. Review before running — do not run automatically.

CREATE OR REPLACE FUNCTION public.enforce_pre_booking_message_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_active_booking boolean;
  sent_count integer;
BEGIN
  -- System-inserted messages (job confirmations, etc.) are never capped.
  IF NEW.is_system THEN
    RETURN NEW;
  END IF;

  -- Same status list and both-direction match as chat/[id].tsx's hasBooking check.
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE status IN ('confirmed', 'in_progress', 'completed', 'approved', 'paid')
      AND (
        (customer_id = NEW.sender_id AND contractor_id = NEW.recipient_id) OR
        (customer_id = NEW.recipient_id AND contractor_id = NEW.sender_id)
      )
  ) INTO has_active_booking;

  IF has_active_booking THEN
    RETURN NEW;
  END IF;

  -- Same count as the client's myMessages.length: non-system messages this
  -- sender has already sent within this chat_id.
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
$$;

DROP TRIGGER IF EXISTS trg_enforce_pre_booking_message_cap ON messages;
CREATE TRIGGER trg_enforce_pre_booking_message_cap
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pre_booking_message_cap();
