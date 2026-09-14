-- Phase 1, function 2 of 4. Same signature/return shape -- p_category
-- filter changes from ILIKE substring against trade_type to a real
-- membership check against contractor_trades, same reasoning as
-- contractors_nearby(). Also pins search_path while touching this
-- function -- it was missing one (a pre-existing gap, not introduced
-- here), unlike every other SECURITY DEFINER function in this project.
--
-- Proved live: p_category='Electrical' correctly includes the real
-- multi-trade contractor (1442f0ec, trade_type now just 'HVAC') via the
-- join; p_category='Plumbing' (a trade they don't have) correctly
-- excludes them. Grants confirmed clean via routine_privileges --
-- authenticated (find-contractor.tsx calls this directly) and
-- service_role (match-and-rank edge function) only, no anon.
CREATE OR REPLACE FUNCTION public.get_ranked_contractors(
  p_category text DEFAULT NULL::text,
  p_area text DEFAULT NULL::text,
  p_pro_priority_featured boolean DEFAULT false
)
RETURNS SETOF contractors
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.*
  FROM public.contractors c
  WHERE c.approval_status = 'approved'
    AND c.is_available = true
    AND (
      p_category IS NULL
      OR EXISTS (SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = p_category)
    )
    AND (
      p_area IS NULL
      OR c.service_area ILIKE '%' || p_area || '%'
      OR c.location      ILIKE '%' || p_area || '%'
      OR c.business_city ILIKE '%' || p_area || '%'
    )
  ORDER BY
    CASE WHEN c.plan IN ('pro', 'leads') THEN 0 ELSE 1 END,
    CASE WHEN p_pro_priority_featured AND c.plan = 'pro' THEN 0 ELSE 1 END,
    random()
$function$;

REVOKE ALL ON FUNCTION public.get_ranked_contractors(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ranked_contractors(text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ranked_contractors(text, text, boolean) TO authenticated;
