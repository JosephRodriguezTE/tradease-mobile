-- Admin visibility gap: the admin queue only ever showed submitted_at,
-- which get-verified.tsx's own upsert already bumps on every save
-- (including a mid-review edit) -- but nothing distinguished "submitted
-- once, untouched" from "edited after the admin started reviewing it".
-- Reusing touch_updated_at(), already used elsewhere in this project for
-- exactly this, rather than writing a new copy of the same trigger.
ALTER TABLE public.contractor_verification ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill BEFORE creating the trigger, not after -- caught this live:
-- the first attempt created the trigger first, and touch_updated_at()
-- (BEFORE UPDATE, unconditionally sets NEW.updated_at := now()) then
-- intercepted the backfill UPDATE itself, silently overwriting the
-- COALESCE(submitted_at, created_at) value it was trying to set with
-- "now" instead. Confirmed by checking a row immediately after --
-- updated_at read as the migration's own run time instead of the
-- expected historical date. Fixed by re-running backfill-then-trigger
-- in that order and re-verifying the same row read back correctly.
UPDATE public.contractor_verification
SET updated_at = COALESCE(submitted_at, created_at);

DROP TRIGGER IF EXISTS trg_touch_contractor_verification_updated_at ON public.contractor_verification;
CREATE TRIGGER trg_touch_contractor_verification_updated_at
BEFORE UPDATE ON public.contractor_verification
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
