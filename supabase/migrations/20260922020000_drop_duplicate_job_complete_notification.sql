-- release_payment_on_completion() and notify_job_completed() both fire on
-- the same UPDATE (status -> 'completed') and both notify new.customer_id,
-- producing two rows per completion: 'job_complete' (this function, a
-- bolted-on side effect of payment release) and 'job_completed'
-- (notify_job_completed, the dedicated completion notification with a
-- proper title/data/icon/actor_name). Keeping 'job_completed' and dropping
-- 'job_complete' here. Payment-release logic is untouched -- only the
-- notification insert is removed.
--
-- Prior definition, for reference:
--
-- CREATE OR REPLACE FUNCTION public.release_payment_on_completion()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- begin
--   -- Only fire when status changes to 'completed'
--   if old.status != 'completed' and new.status = 'completed' then
--     -- Mark payment as ready to release
--     if new.payment_status = 'held' then
--       new.payment_status := 'released';
--     end if;
--
--     -- Notify customer
--     insert into public.notifications (user_id, message, type, booking_id)
--     values (
--       new.customer_id,
--       '🎉 Job marked complete! Payment has been released to your contractor.',
--       'job_complete',
--       new.id
--     );
--   end if;
--   return new;
-- end;
-- $function$

CREATE OR REPLACE FUNCTION public.release_payment_on_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Only fire when status changes to 'completed'
  if old.status != 'completed' and new.status = 'completed' then
    -- Mark payment as ready to release
    if new.payment_status = 'held' then
      new.payment_status := 'released';
    end if;
  end if;
  return new;
end;
$function$;
