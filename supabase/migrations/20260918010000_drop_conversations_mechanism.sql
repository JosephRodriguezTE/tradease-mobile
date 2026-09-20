-- Drop the conversations mechanism entirely.
--
-- Every live reader/writer of `conversations` and `messages.conversation_id`
-- has been removed from both the mobile app and the website: threads are now
-- derived purely from messages.chat_id. See docs/PAYMENT_FLOW_STATE.md-style
-- audit in the accompanying PR description for the full trace.
--
-- Order matters: RLS policies on `messages` reference `conversation_id` by
-- name, so they must be dropped before the column, and the column must be
-- dropped before the table (or CASCADE would take it regardless, but we
-- want each step explicit and reviewable).

-- 1. Drop RLS policies that reference conversations/conversation_id.
--    "Employees read/send company messages" gated a company-messaging
--    feature on the `employees` table (0 rows today, no chat_id-based
--    equivalent exists) -- confirmed dead in practice and dropped with no
--    replacement per product decision.
drop policy if exists "Msg participants" on public.messages;
drop policy if exists "Employees read company messages" on public.messages;
drop policy if exists "Employees send company messages" on public.messages;
drop policy if exists "Conv participants" on public.conversations;
drop policy if exists "Conv insert" on public.conversations;

-- 2. Drop the orphaned trigger function -- confirmed no trigger calls it.
drop function if exists public.update_conversation_last_message();

-- 3. Drop the now-dead column. Auto-drops messages_conversation_id_fkey,
--    idx_messages_conversation, and idx_messages_unread_conv.
alter table public.messages drop column if exists conversation_id;

-- 4. Drop the table itself. `status` is plain text (not an enum), so there
--    is no enum type to drop alongside it.
drop table if exists public.conversations;
