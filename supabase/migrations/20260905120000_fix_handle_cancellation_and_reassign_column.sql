-- handle_cancellation_and_reassign() inserted into cancellations using
-- rule_label, which does not exist -- the real column is rule_applied
-- (matching handle_booking_cancellation(), the other trigger that writes
-- to this same table correctly). This is a BEFORE UPDATE OF status
-- trigger firing on transition to 'declined' OR 'cancelled', so it broke
-- both cancel_booking() (status -> 'cancelled') and the contractor-decline
-- path (status -> 'declined') identically: insert throws 42703, the
-- whole UPDATE rolls back, the RPC/update fails.
CREATE OR REPLACE FUNCTION public.handle_cancellation_and_reassign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- Log cancellation
  insert into public.cancellations
    (booking_id, cancelled_by, hours_before, fee_percent, rule_applied, refund_status, reassign_needed)
  values (
    new.id, v_by,
    round(v_hours::numeric, 1),
    v_fee_pct, v_label,
    case when v_fee_pct = 0 then 'na' else 'pending' end,
    case when v_by = 'contractor' then true else false end
  );

  -- Update booking fee fields
  new.cancelled_at    := now();
  new.fee_applied     := v_fee_pct > 0;
  new.fee_percent     := v_fee_pct;
  new.cancelled_by    := v_by;

  -- Notify customer
  if v_by = 'contractor' then
    insert into public.notifications (user_id, message, type, booking_id)
    values (
      new.customer_id,
      '⚠️ ' || coalesce(new.contractor_name, 'Your contractor') ||
      ' cancelled your booking. We are finding you a new contractor — check your bookings.',
      'booking_cancelled',
      new.id
    );
  else
    -- Customer cancelled — notify contractor
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
