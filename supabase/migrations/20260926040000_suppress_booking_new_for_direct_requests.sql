-- ============================================================================
-- A company-card direct request produced two notifications on insert:
-- notify_new_job_posted()'s direct branch (type 'direct_request', correct)
-- and notify_contractor_new_booking() (type 'booking_new', redundant --
-- direct requests already get their own notification, and this one's
-- "for an upcoming date" copy is vacuous since direct requests collect no
-- date at all). Both fire from the same AFTER INSERT event
-- (on_new_job_posted and on_booking_created respectively).
--
-- Fix: suppress notify_contractor_new_booking() when request_mode = 'direct',
-- alongside its existing contractor_id IS NULL early return.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_contractor_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Only notify if a contractor is actually assigned at insert time.
  -- Open jobs posted to the job board have no contractor yet — skip.
  -- Direct requests already get their own 'direct_request' notification
  -- (notify_new_job_posted()'s direct branch); this generic booking_new
  -- notification would be redundant, and its "for an upcoming date" copy
  -- is vacuous since direct requests collect no date.
  if new.contractor_id is null or new.request_mode = 'direct' then
    return new;
  end if;

  insert into public.notifications (user_id, message, type, booking_id)
  values (
    new.contractor_id::uuid,
    '📅 New booking request from ' || coalesce(new.customer_name, 'a customer') ||
    ' for ' || coalesce(to_char(new.booking_date, 'Mon DD'), 'an upcoming date') ||
    case when new.booking_time is not null then ' at ' || new.booking_time else '' end,
    'booking_new',
    new.id
  );
  return new;
end;
$function$;
