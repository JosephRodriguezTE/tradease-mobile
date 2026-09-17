-- Dead-code sweep, this session. Every function below was re-verified live
-- immediately before this migration was written: no trigger (pg_trigger),
-- no RLS policy reference (pg_policy, both polqual and polwithcheck), no
-- call from any other live function's body, and no .rpc() call site
-- anywhere in either repo or any edge function. Full audit reported in
-- chat before this was written; nothing here was deleted on assumption.
--
-- Explicitly NOT included, despite also having zero callers today:
-- fn_guard_wo_status_transition, fn_log_wo_status_change (the real fix for
-- the status/wo_status gap in PAYMENT_FLOW_STATE.md -- deserves its own
-- pass, not deletion), restrict_booking_contractor_update,
-- update_conversation_last_message, fn_cleanup_contractor_location (each
-- a live gap, being investigated separately, not garbage).
--
-- Also removed from this list after the first apply attempt failed:
-- rls_auto_enable() -- not dead. It's the function behind event trigger
-- ensure_rls (fires on ddl_command_end), which auto-enables RLS on every
-- new table created in public. My original sweep only checked pg_trigger/
-- pg_policy/nested-calls/RPC-call-sites -- none of which cover event
-- triggers, a different catalog (pg_event_trigger) entirely. Postgres
-- refused the DROP and named the dependency; caught before anything broke,
-- not after. Re-ran a pg_depend check across every remaining function
-- afterward -- nothing else in this list has any dependency of any kind.

-- ── Dead alternate work-order-completion implementation ──────────────────
-- Superseded by the awaiting_approval/payment_releasing state machine
-- (validate_work_order_transition, mark_work_order_paid). Documented as
-- attached to zero triggers in docs/PAYMENT_FLOW_STATE.md (2026-08-30);
-- re-confirmed today.
DROP FUNCTION IF EXISTS public.handle_work_order_completed();
DROP FUNCTION IF EXISTS public.notify_payment_approved();
DROP FUNCTION IF EXISTS public.email_on_payment_approved();

-- ── Dead job-matching implementation ──────────────────────────────────────
-- Superseded by the current job-feed/offer flow (contractors_nearby,
-- get_ranked_contractors, submit_quote, customer_respond_offer). No
-- trigger, no caller anywhere.
DROP FUNCTION IF EXISTS public.find_next_contractor(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.match_contractors_for_job(uuid, text, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.notify_contractors_new_open_job();

-- ── Dead booking-status notification duplicates ───────────────────────────
-- Four separate, independently-written implementations of "notify the
-- customer when a booking's status changes," none attached to any
-- trigger, each with different copy. A superseded family, same shape as
-- the handle_booking_cancellation redundancy fixed earlier this session.
DROP FUNCTION IF EXISTS public.notify_booking_status();
DROP FUNCTION IF EXISTS public.notify_booking_status_change();
DROP FUNCTION IF EXISTS public.notify_customer_booking_update();
DROP FUNCTION IF EXISTS public.notify_customer_on_status();

-- ── Dead employee-auth helpers ─────────────────────────────────────────────
-- The real, live employee-management path (supabase/functions/
-- manage-employee/index.ts) calls employee_limit_for_plan,
-- verify_company_pin, and check_pin_matches directly -- never these three.
-- Superseded by inline logic in that edge function, not wired to anything.
DROP FUNCTION IF EXISTS public.verify_employee_login(text, integer, text);
DROP FUNCTION IF EXISTS public.mark_employee_login();
DROP FUNCTION IF EXISTS public.set_company_credentials(text, text);
DROP FUNCTION IF EXISTS public.has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.is_employee();

-- ── Miscellaneous dead helpers ─────────────────────────────────────────────
-- update_booking_timestamp: one-line updated_at touch, superseded by the
--   generic touch_updated_at()/handle_updated_at() already active elsewhere.
-- fn_assign_work_order_number: duplicate of the actually-active
--   generate_work_order_number() (confirmed via trigger trg_wo_number --
--   the one really producing "TE-2026-XXXXX" numbers).
-- effective_contractor_id, get_dashboard_redirect: no trigger, no policy
--   reference, no caller anywhere.
DROP FUNCTION IF EXISTS public.update_booking_timestamp();
DROP FUNCTION IF EXISTS public.fn_assign_work_order_number();
DROP FUNCTION IF EXISTS public.effective_contractor_id();
DROP FUNCTION IF EXISTS public.get_dashboard_redirect(uuid);
