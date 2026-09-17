-- Confirmed dead duplicate of restrict_booking_update(), which is attached
-- (1 live trigger) and is a strict superset: same two contractor-side
-- blocks (can't change customer_id, can't change contractor_id) plus
-- "can't revert to pending" and a full set of customer-side protections.
-- restrict_booking_contractor_update() itself has zero triggers, zero
-- policy references, zero callers -- folded into the dead-code cleanup
-- per instruction, one function, own migration since the batch drop
-- already landed.
DROP FUNCTION IF EXISTS public.restrict_booking_contractor_update();
