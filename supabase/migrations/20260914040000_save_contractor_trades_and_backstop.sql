-- Phase 2: the write-path repoint. save_contractor_trades() is the one
-- RPC all six single/multi-select trade screens (both repos) now call
-- instead of writing contractors.trade_type directly.
--
-- Atomic replace, not a client-side delete-then-insert -- a network
-- failure between two separate client calls would risk leaving a
-- contractor with zero trades, which is exactly the bug this migration
-- exists to close off.
--
-- Clears any existing primary in its own statement before the upsert,
-- rather than relying on the upsert's row-by-row ON CONFLICT processing
-- to net out to exactly one true -- the partial unique index (one
-- primary per contractor) would reject a transient moment where the old
-- and new primary are both true within the same multi-row upsert,
-- depending on row processing order. Clearing first means nothing is
-- ever marked primary going into the upsert, so at most one row ever
-- transitions to true, regardless of order.
--
-- Requires at least one trade and a primary that's actually in the
-- selected set -- server-side, not just trusting client-side
-- validation for something this consequential.
--
-- Ordering requirement, proved live: contractor_trades.contractor_id is
-- FK'd to contractors.id, so this can only succeed once the contractor
-- row already exists -- calling it first raises a foreign key
-- violation (confirmed against a synthetic id with no contractors row
-- at all). Every signup flow must insert the contractor row, THEN call
-- this, never in parallel. Proved the full sequence live too: a real,
-- previously-contractor-less auth user, inserted with no trade_type
-- written directly, then this RPC called for a single trade -- the row
-- landed, trade_type followed via contractor_trades_maintain(), and
-- contractors_nearby() returned them for that trade. Cleaned up after;
-- the auth.users row was never touched.
CREATE OR REPLACE FUNCTION public.save_contractor_trades(
  p_trade_ids text[],
  p_primary_trade_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_trade_ids IS NULL OR array_length(p_trade_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one trade is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_primary_trade_id IS NULL OR NOT (p_primary_trade_id = ANY(p_trade_ids)) THEN
    RAISE EXCEPTION 'Primary trade must be one of the selected trades' USING ERRCODE = 'P0001';
  END IF;

  UPDATE contractor_trades SET is_primary = false
  WHERE contractor_id = auth.uid() AND is_primary = true;

  DELETE FROM contractor_trades
  WHERE contractor_id = auth.uid() AND NOT (trade_id = ANY(p_trade_ids));

  INSERT INTO contractor_trades (contractor_id, trade_id, is_primary, sort_order)
  SELECT auth.uid(), t.id, (t.id = p_primary_trade_id), t.sort_order
  FROM trades t
  WHERE t.id = ANY(p_trade_ids)
  ON CONFLICT (contractor_id, trade_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary, sort_order = EXCLUDED.sort_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_contractor_trades(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_contractor_trades(text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_contractor_trades(text[], text) TO authenticated;

-- Backstop for the exact class of bug just fixed across all six write
-- paths: a contractor with verification_status = 'approved' and zero
-- contractor_trades rows -- a correct-looking profile that's invisible
-- to contractors_nearby(), get_ranked_contractors(),
-- email_on_new_job_posted(), and the map filter, and nothing about the
-- profile itself would ever surface that.
--
-- A plain view, not RLS/grant-restricted to a specific role -- this is
-- an operational query, not an application data path. No anon/
-- authenticated grant, so it's reachable via direct DB access but not
-- through either app. The website's admin contractors page also queries
-- it directly (via its existing service-role admin client, which
-- bypasses grants entirely) to show a banner -- see that repo's commit.
--
-- Proved live: a real, scoped test contractor with a trade didn't
-- appear; deleting their only trade row made them appear immediately;
-- deleting the test contractor entirely returned the view to empty.
CREATE OR REPLACE VIEW public.contractors_missing_trades AS
SELECT c.id, c.company_name, c.email, c.verification_status, c.created_at
FROM public.contractors c
WHERE c.verification_status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.contractor_trades ct WHERE ct.contractor_id = c.id)
ORDER BY c.created_at DESC;

REVOKE ALL ON public.contractors_missing_trades FROM PUBLIC, anon, authenticated;
