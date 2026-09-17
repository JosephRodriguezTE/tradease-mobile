-- Two independent bugs in handle_cancellation_and_reassign(), found via the
-- live schema (no reassign_needed column exists) after the 2026-09-05 fix
-- only corrected the rule_label -> rule_applied typo and missed both of
-- these. NOT touching the third bug reported alongside these (this trigger
-- and handle_booking_cancellation() both firing on 'declined') -- that
-- needs handle_booking_cancellation()'s actual definition, which isn't in
-- either repo, before deciding which trigger should own that path.
--
-- 1. reassign_needed was inserted into cancellations but the live table
--    has no such column (confirmed against the live schema: id,
--    booking_id, cancelled_by, cancel_reason, hours_before, fee_percent,
--    fee_amount, refund_amount, refund_status, rule_applied, notes,
--    created_at). Every insert threw 42703 and rolled back the whole
--    UPDATE -- meaning cancel_booking() and the contractor-decline path
--    have been broken since 2026-09-05, not newly regressed. Removed
--    from the insert; not replaced with anything, since nothing reads a
--    reassign_needed column anywhere in either repo (grepped both).
--
-- 2. The customer-cancelled branch inserted a notification with
--    user_id = new.contractor_id::uuid unconditionally. On an unclaimed
--    job (never accepted, contractor_id null) that casts to NULL and
--    inserts a notification with a null user_id -- this is the actual
--    exception hit when a customer acts on an expired job, and it would
--    only start firing once bug 1 above stopped masking it by rolling
--    back first. Fixed by skipping the notification when there's no
--    contractor to notify, rather than inserting the null.
--
-- Also retrofits SET search_path TO 'public' -- missing on the
-- 2026-09-05 version, standard hardening for every SECURITY DEFINER
-- function touched in this project (see docs/supabase-gotchas.md).
CREATE OR REPLACE FUNCTION public.handle_cancellation_and_reassign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hours   numeric;
  v_rule    record;
  v_fee_pct int := 0;
  v_label   text := 'Free';
  v_by      text;
begin
  if new.status not in ('declined','cancelled') then return new; end if;
  if old.status = new.status then return new; end if;

  -- Determine who cancelled
  v_by := coalesce(new.cancelled_by,
    case when new.status = 'declined' then 'contractor' else 'customer' end);

  -- Calculate hours until booking
  if new.booking_date is not null then
    v_hours := extract(epoch from (
      (new.booking_date::timestamp + coalesce(new.booking_time, '09:00')::time) - now()
    )) / 3600.0;
  else
    v_hours := 999;
  end if;

  -- Customer cancellation = fee; contractor cancellation = no fee to customer
  if v_by = 'customer' then
    select * into v_rule from public.cancellation_rules
    where hours_before <= greatest(v_hours, 0)
    order by hours_before desc limit 1;
    if found then
      v_fee_pct := v_rule.fee_percent;
      v_label   := v_rule.label;
    end if;
  end if;

  -- Log cancellation -- reassign_needed removed, see migration header
  insert into public.cancellations
    (booking_id, cancelled_by, hours_before, fee_percent, rule_applied, refund_status)
  values (
    new.id, v_by,
    round(v_hours::numeric, 1),
    v_fee_pct, v_label,
    case when v_fee_pct = 0 then 'na' else 'pending' end
  );

  -- Update booking fee fields
  new.cancelled_at    := now();
  new.fee_applied     := v_fee_pct > 0;
  new.fee_percent     := v_fee_pct;
  new.cancelled_by    := v_by;

  -- Notify the other party -- only if there is one
  if v_by = 'contractor' then
    insert into public.notifications (user_id, message, type, booking_id)
    values (
      new.customer_id,
      '⚠️ ' || coalesce(new.contractor_name, 'Your contractor') ||
      ' cancelled your booking. We are finding you a new contractor — check your bookings.',
      'booking_cancelled',
      new.id
    );
  elsif new.contractor_id is not null then
    -- Customer cancelled and a contractor was actually assigned. An
    -- unclaimed/expired job has no contractor_id -- nothing to notify.
    insert into public.notifications (user_id, message, type, booking_id)
    values (
      new.contractor_id::uuid,
      '❌ ' || coalesce(new.customer_name, 'A customer') ||
      ' cancelled their booking request.',
      'booking_cancelled_contractor',
      new.id
    );
  end if;

  return new;
end;
$function$;
