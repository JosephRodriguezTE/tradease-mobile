-- notify_new_message() was SECURITY INVOKER, so it ran as the message
-- sender and tried to insert a notifications row with user_id =
-- recipient_id. notifications_restrict_insert requires auth.uid() =
-- user_id, which the sender can never satisfy for the recipient's row --
-- structurally unsatisfiable. Every real chat message insert by an
-- authenticated (non-service-role) client failed at this trigger.
--
-- Fix: SECURITY DEFINER + pinned search_path, matching the other
-- notification triggers that already do this correctly (e.g.
-- enforce_pre_booking_message_cap, trigger_send_push_notification).
--
-- Because this now bypasses notifications' owner-scoped RLS by design,
-- NEW.recipient_id can no longer be trusted at face value: messages'
-- own RLS only checks sender_id = auth.uid(), so a client could
-- otherwise set an unrelated recipient_id and force a notification onto
-- an arbitrary user. This version re-derives the legitimate other party
-- from chat_id (same pairing convention as validate_and_fill_message)
-- and only creates the notification when recipient_id actually matches
-- that derived party.
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid1 uuid;
  v_uid2 uuid;
  v_target uuid;
BEGIN
  IF NEW.chat_id IS NOT NULL THEN
    BEGIN
      v_uid1 := split_part(NEW.chat_id, '_', 1)::uuid;
      v_uid2 := split_part(NEW.chat_id, '_', 2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_uid1 := NULL;
      v_uid2 := NULL;
    END;
    IF v_uid1 IS NOT NULL AND v_uid2 IS NOT NULL THEN
      v_target := CASE WHEN v_uid1 = NEW.sender_id THEN v_uid2 ELSE v_uid1 END;
    END IF;
  END IF;

  IF v_target IS NOT NULL AND v_target = NEW.recipient_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, icon, actor_name)
    VALUES (
      NEW.recipient_id, 'new_message', 'New Message 💬',
      COALESCE(NEW.sender_name,'Someone') || ': ' || LEFT(COALESCE(NEW.body,''),60),
      jsonb_build_object('chat_id',NEW.chat_id,'sender_id',NEW.sender_id),
      'chatbubble-outline', NEW.sender_name
    );
  END IF;

  RETURN NEW;
END;
$function$;
