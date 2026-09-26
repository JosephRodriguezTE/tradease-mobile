-- ============================================================================
-- Passive monitor for the realtime.messages partition gap discovered
-- 2026-09-26: no partition existed past 2026-09-24 for roughly half a day
-- (self-healed by ~15:31 UTC that day), and realtime.send() swallows the
-- resulting failure completely (EXCEPTION WHEN OTHERS THEN RAISE WARNING,
-- never RAISE EXCEPTION) -- nothing in the app would ever surface it.
--
-- This does NOT create or alter partitions. Confirmed: the postgres role
-- (including the Dashboard's own SQL editor) has no CREATE on schema
-- realtime, owned by supabase_admin/supabase_realtime_admin, and cannot
-- assume either role. Per Supabase's own docs, realtime.messages is
-- partitioned by day and retained for 3 days by their Realtime service
-- itself -- not a project-level pg_cron/pg_partman job. Building our own
-- creation job would need permissions we don't have and could fight their
-- retention/cleanup if their service ever ran alongside ours. This only
-- checks and alerts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.realtime_partition_alert_state (
  id int PRIMARY KEY DEFAULT 1,
  alert_active boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  last_alert_at timestamptz,
  last_missing_date date,
  CONSTRAINT realtime_partition_alert_state_singleton CHECK (id = 1)
);

INSERT INTO public.realtime_partition_alert_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Checks whether TOMORROW's partition exists (naming convention confirmed
-- live: messages_YYYY_MM_DD). Fires an admin notification -- exactly once
-- per continuous gap -- via public.notifications, which already has an
-- AFTER INSERT trigger (on_notification_send_push) that sends a real push.
-- The type ops_realtime_partition_gap is added to NEVER_SUPPRESSIBLE in
-- send-push-notification/index.ts so it can't be silently muted by an
-- admin's notification prefs.
CREATE OR REPLACE FUNCTION public.check_realtime_partition_health()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tomorrow date := (now() AT TIME ZONE 'UTC')::date + 1;
  v_partition_exists boolean;
  v_alert_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_inherits i
    JOIN pg_class child ON child.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    WHERE pn.nspname = 'realtime' AND parent.relname = 'messages'
      AND n.nspname = 'realtime'
      AND child.relname = 'messages_' || to_char(v_tomorrow, 'YYYY_MM_DD')
  ) INTO v_partition_exists;

  SELECT alert_active INTO v_alert_active
  FROM public.realtime_partition_alert_state WHERE id = 1;

  IF v_partition_exists THEN
    -- Healthy: clear any outstanding alert so a future gap can alert again.
    UPDATE public.realtime_partition_alert_state
    SET alert_active = false, last_checked_at = now()
    WHERE id = 1;
    RETURN;
  END IF;

  UPDATE public.realtime_partition_alert_state
  SET last_checked_at = now(), last_missing_date = v_tomorrow
  WHERE id = 1;

  IF v_alert_active THEN
    -- Already alerted for this ongoing gap. Stay quiet.
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message)
  SELECT id, 'ops_realtime_partition_gap', '⚠️ Realtime partition missing',
         'realtime.messages has no partition for ' || v_tomorrow::text ||
         '. Live lead broadcasts (leads:<trade>) may silently fail starting that day. ' ||
         'This alert will not repeat until the gap is resolved.'
  FROM public.users
  WHERE is_admin = true;

  UPDATE public.realtime_partition_alert_state
  SET alert_active = true, last_alert_at = now()
  WHERE id = 1;
END;
$function$;

SELECT cron.schedule(
  'check-realtime-partition-health',
  '0 6 * * *',
  $$SELECT public.check_realtime_partition_health();$$
);
