-- Request Contractor (24h) vs Post Job (48h) — active windows on the request itself,
-- not on scheduled_at (which stays null until a contractor is matched).
-- Additive only. Review before running — do not run automatically.

-- 1. New columns on bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS request_mode text
    CHECK (request_mode IN ('request', 'post'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS request_expires_at timestamptz;

COMMENT ON COLUMN bookings.request_mode IS
  '''request'' = customer asked a specific/matched contractor directly (24h window). ''post'' = customer posted publicly for any matching contractor (48h window). Null for drafts and for bookings created before this column existed.';

COMMENT ON COLUMN bookings.request_expires_at IS
  'Deadline for the request/post to be matched (contractor_id set) before it is auto-cancelled by sweep_expire_stale_requests(). Set once at creation, never on scheduled_at.';

-- 2. Sweep function — mirrors sweep_auto_approve_work_orders() exactly:
--    SECURITY DEFINER, idempotent (only touches rows still pending + unmatched + past
--    their own deadline, so a second run against an already-swept row is a no-op),
--    not directly callable by clients (see REVOKE below).
CREATE OR REPLACE FUNCTION public.sweep_expire_stale_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bookings
  SET
    status        = 'cancelled',
    cancelled_at  = now(),
    cancelled_by  = 'system',
    cancel_reason = 'request_expired'
  WHERE request_mode IS NOT NULL
    AND status = 'pending'
    AND contractor_id IS NULL
    AND request_expires_at IS NOT NULL
    AND request_expires_at < now();
END;
$$;

-- Lock it down the same way the auto-approve sweep is locked down: only pg_cron's
-- invocation (running as the function owner via SECURITY DEFINER) can call this —
-- no authenticated client should be able to trigger a sweep on demand.
REVOKE ALL ON FUNCTION public.sweep_expire_stale_requests() FROM PUBLIC, anon, authenticated;

-- 3. Schedule it — same 15-minute cadence as the existing auto-approve sweep.
SELECT cron.schedule(
  'expire-stale-requests',
  '*/15 * * * *',
  $$SELECT public.sweep_expire_stale_requests();$$
);
