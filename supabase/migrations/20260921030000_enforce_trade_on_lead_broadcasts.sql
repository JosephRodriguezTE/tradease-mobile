-- Enforce trade-level authorization on realtime.messages' 'leads:%' policy.
--
-- The prior policy (authenticated can read lead broadcasts) only checked
-- role = authenticated and that the topic started with 'leads:' -- it did
-- not check who the subscriber actually is. Proved empirically: a real
-- Electrical-only contractor could subscribe to leads:hvac (wrong trade),
-- and a customer with no contractors row at all could subscribe to any
-- leads:* topic. Both got SUBSCRIBED. Only a bare anon client (no session)
-- was rejected.
--
-- Confirmed before writing this: the trade string in every topic
-- ('leads:' || bookings.trade, set by trg_broadcast_new_job_lead) and the
-- values in contractor_trades.trade_id / contractors.trade_type / trades.id
-- all match byte-for-byte -- same spelling, same case, same length
-- ('HVAC' is 4 chars and 'Electrical' is 10 chars in all four places).
-- No case-folding needed in this policy.
--
-- New rule:
--   1. Subscriber must have a contractors row where contractors.id = auth.uid().
--      This alone excludes customers (no contractors row) and employees
--      (an employee's own auth.uid() is never a contractors.id -- employees
--      work under employers.contractor_id via a separate employees table,
--      per the existing "Employees view accepted bookings" bookings policy).
--   2. The trade in the topic (substring after 'leads:') must match either
--      a contractor_trades.trade_id row for that contractor, or
--      contractors.trade_type as a fallback -- and only a fallback: it's
--      checked only when that contractor has zero contractor_trades rows,
--      same rule as contractorTradeIds() (mobile) and public_jobs_nearby's
--      trade_filter_ids callers. A contractor with contractor_trades rows
--      that don't include the topic's trade does not fall through to
--      trade_type.

DROP POLICY IF EXISTS "authenticated can read lead broadcasts" ON realtime.messages;

CREATE POLICY "contractors can read their own trade's lead broadcasts"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'leads:%'
    AND EXISTS (
      SELECT 1
      FROM public.contractors c
      WHERE c.id = auth.uid()
        AND (
          EXISTS (
            SELECT 1 FROM public.contractor_trades ct
            WHERE ct.contractor_id = c.id
              AND ct.trade_id = substring(realtime.topic() FROM 7)
          )
          OR (
            NOT EXISTS (SELECT 1 FROM public.contractor_trades ct WHERE ct.contractor_id = c.id)
            AND c.trade_type = substring(realtime.topic() FROM 7)
          )
        )
    )
  );
