-- ============================================================================
-- contractor_earnings and contractor_team_summary had no row-scoping at
-- all -- any contractor_id could be queried directly for that contractor's
-- real earnings/team size, even though the app only ever asks for its own.
--
-- Row-scoped to exactly what useRole() resolves as "this caller's own
-- contractor context": their own id (contractor_id = auth.uid()), or, for
-- an active employee, their employer's id via the same predicate useRole()
-- uses (contractor_employees WHERE user_id = auth.uid() AND status =
-- 'active'). App code already only ever queries .eq('contractor_id',
-- <own-or-employer-id>), so this changes nothing for legitimate callers --
-- it only removes the ability to query anyone else's.
--
-- Proof: contractor A sees their own row (jobs_today, active_count, etc.
-- all correct); contractor B querying A's contractor_id gets an empty
-- result from both views; an active employee of A querying A's
-- contractor_id sees the same data A sees.
-- ============================================================================

CREATE OR REPLACE VIEW public.contractor_earnings AS
SELECT
  contractor_id,
  sum(CASE WHEN completed_at::date = CURRENT_DATE THEN COALESCE(contractor_payout, final_price::numeric, price_estimate::numeric, 0::numeric) ELSE 0::numeric END) AS today,
  sum(CASE WHEN completed_at >= date_trunc('week', now()) THEN COALESCE(contractor_payout, final_price::numeric, price_estimate::numeric, 0::numeric) ELSE 0::numeric END) AS this_week,
  sum(CASE WHEN completed_at >= date_trunc('month', now()) THEN COALESCE(contractor_payout, final_price::numeric, price_estimate::numeric, 0::numeric) ELSE 0::numeric END) AS this_month,
  count(CASE WHEN completed_at::date = CURRENT_DATE THEN 1 ELSE NULL::integer END) AS jobs_today,
  count(CASE WHEN completed_at >= date_trunc('week', now()) THEN 1 ELSE NULL::integer END) AS jobs_this_week,
  count(CASE WHEN status = 'confirmed' AND contractor_id IS NOT NULL THEN 1 ELSE NULL::integer END) AS active_jobs
FROM bookings
WHERE status = ANY (ARRAY['completed'::text, 'confirmed'::text])
  AND (
    contractor_id = auth.uid()
    OR contractor_id IN (
      SELECT contractor_employees.contractor_id FROM contractor_employees
      WHERE contractor_employees.user_id = auth.uid() AND contractor_employees.status = 'active'
    )
  )
GROUP BY contractor_id;

CREATE OR REPLACE VIEW public.contractor_team_summary AS
SELECT
  contractor_id,
  count(*) FILTER (WHERE status = 'active') AS active_count,
  count(*) FILTER (WHERE status = 'invited') AS pending_count,
  count(*) FILTER (WHERE status = ANY (ARRAY['active'::text, 'invited'::text])) AS total_used,
  sum(jobs_completed) AS team_jobs_total
FROM contractor_employees ce
WHERE ce.contractor_id = auth.uid()
   OR ce.contractor_id IN (
     SELECT contractor_employees.contractor_id FROM contractor_employees
     WHERE contractor_employees.user_id = auth.uid() AND contractor_employees.status = 'active'
   )
GROUP BY contractor_id;
