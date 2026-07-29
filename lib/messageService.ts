import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─── Chat ID helpers ──────────────────────────────────────────────────────────

/** Derives a stable chat_id from two user UUIDs (alphabetically sorted, joined with _) */
export function deriveChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

/** Extracts the other user's ID from a chat_id given the current user's ID */
export function otherUserFromChatId(chatId: string, myId: string): string {
  const [a, b] = chatId.split('_');
  return a === myId ? b : a;
}

// ─── Chat list (messages tab) ─────────────────────────────────────────────────

export interface ChatSummary {
  chatId: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string;
  lastTime: string;
  unread: number;
  isSystem: boolean;
  hasActiveJob: boolean;
  activeBookingId: string | null;
  activeJobTrade: string | null;
}

export async function getChatList(): Promise<{ summaries: ChatSummary[]; userId: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .not('chat_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const msgs = data ?? [];

  // Deduplicate: keep most recent message per chat_id
  const seen = new Set<string>();
  const latest: any[] = [];
  for (const m of msgs) {
    if (m.chat_id && !seen.has(m.chat_id)) {
      seen.add(m.chat_id);
      latest.push(m);
    }
  }

  if (latest.length === 0) return { summaries: [], userId: user.id };

  // Count unread per chat_id
  const { data: unreadRows } = await supabase
    .from('messages')
    .select('chat_id')
    .eq('recipient_id', user.id)
    .eq('read', false)
    .not('chat_id', 'is', null);

  const unreadCounts: Record<string, number> = {};
  for (const r of (unreadRows ?? [])) {
    unreadCounts[r.chat_id] = (unreadCounts[r.chat_id] ?? 0) + 1;
  }

  // Extract unique other-user IDs
  const otherIds = [...new Set(latest.map(m => {
    const [a, b] = m.chat_id.split('_');
    return a === user.id ? b : a;
  }).filter(Boolean))];

  // Batch-lookup names and active bookings in parallel
  const [{ data: contractors }, { data: users }, { data: activeBookings }] = await Promise.all([
    supabase.from('contractors_public').select('id,company_name,avatar_url').in('id', otherIds),
    supabase.from('users').select('id,full_name,avatar_url').in('id', otherIds),
    supabase
      .from('bookings')
      .select('id,customer_id,contractor_id,trade,status')
      .or(`customer_id.eq.${user.id},contractor_id.eq.${user.id}`)
      .in('status', ['confirmed', 'in_progress']),
  ]);

  const ctrMap: Record<string, any> = Object.fromEntries((contractors ?? []).map(c => [c.id, c]));
  const usrMap: Record<string, any> = Object.fromEntries((users ?? []).map(u => [u.id, u]));

  const summaries: ChatSummary[] = latest.map(m => {
    const [a, b] = m.chat_id.split('_');
    const otherId = a === user.id ? b : a;
    const ctr = ctrMap[otherId];
    const usr = usrMap[otherId];
    const activeBooking = (activeBookings ?? []).find(
      bk => bk.customer_id === otherId || bk.contractor_id === otherId,
    );
    return {
      chatId:          m.chat_id,
      otherId,
      otherName:       ctr?.company_name ?? usr?.full_name ?? 'User',
      otherAvatar:     ctr?.avatar_url ?? usr?.avatar_url ?? null,
      lastMessage:     m.body ?? '',
      lastTime:        m.created_at ?? '',
      unread:          unreadCounts[m.chat_id] ?? 0,
      isSystem:        m.is_system ?? false,
      hasActiveJob:    !!activeBooking,
      activeBookingId: activeBooking?.id ?? null,
      activeJobTrade:  activeBooking?.trade ?? null,
    };
  });

  return { summaries, userId: user.id };
}

// ─── Chat messages ────────────────────────────────────────────────────────────

export async function getChatMessages(chatId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─── Send message ─────────────────────────────────────────────────────────────

export async function sendChatMessage({
  chatId,
  recipientId,
  content,
  senderName,
  isSystem = false,
  senderRole = 'user',
}: {
  chatId: string;
  recipientId: string;
  content: string;
  senderName: string;
  isSystem?: boolean;
  senderRole?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id:     chatId,
      sender_id:   user.id,
      recipient_id: recipientId,
      sender_name:  senderName,
      body:         content,
      read:         false,
      is_system:    isSystem,
      sender_role:  senderRole,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Mark messages read ───────────────────────────────────────────────────────

export async function markChatRead(chatId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('messages')
    .update({ read: true })
    .eq('chat_id', chatId)
    .neq('sender_id', user.id);
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToChatMessages(
  chatId: string,
  onMessage: (msg: any) => void
): RealtimeChannel {
  return supabase
    .channel(`chat:${chatId}:${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: `chat_id=eq.${chatId}`,
    }, payload => onMessage(payload.new))
    .subscribe();
}

export function unsubscribeFromChat(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

// ─── Legacy — kept for backward compat ───────────────────────────────────────

export async function getConversations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      customer:customer_id (id, full_name, avatar_url),
      contractor:contractor_id (id, company_name, trade_type, avatar_url)
    `)
    .or(`customer_id.eq.${user.id},contractor_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function sendMessage({
  conversationId,
  body,
  senderRole,
}: {
  conversationId: string;
  body: string;
  senderRole: 'customer' | 'contractor';
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id:       user.id,
      sender_role:     senderRole,
      body,
      read: false,
    })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('conversations')
    .update({ last_message: body, last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return data;
}

export async function markMessagesRead(conversationId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id);
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (msg: any) => void
): RealtimeChannel {
  return supabase
    .channel(`conv:${conversationId}:${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, payload => onMessage(payload.new))
    .subscribe();
}

export function unsubscribeFromMessages(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

export async function startPreBookingConversation(contractorId: string, _contractorName: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('customer_id', user.id)
    .eq('contractor_id', contractorId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('conversations')
    .insert({ customer_id: user.id, contractor_id: contractorId, status: 'pending', last_message: '' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
