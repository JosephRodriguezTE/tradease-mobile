import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deriveChatId,
  getChatMessages,
  markChatRead,
  otherUserFromChatId,
  sendChatMessage,
  subscribeToChatMessages,
  unsubscribeFromChat,
} from '../../lib/messageService';
import { sendPushNotification } from '../../lib/notifications';

const PRE_BOOKING_LIMIT = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msgTime(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, C }: { msg: any; isMe: boolean; C: any }) {
  const isSystem = msg.is_system;

  if (isSystem) {
    return (
      <View style={{ alignSelf: 'center', marginVertical: 4, maxWidth: '80%' }}>
        <View style={{ backgroundColor: 'rgba(255,98,0,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: 'rgba(255,98,0,0.2)' }}>
          <Text style={{ fontSize: 12, color: C.textSecondary, textAlign: 'center', lineHeight: 18 }}>{msg.body}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[
      { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
      isMe ? { alignSelf: 'flex-end', flexDirection: 'row-reverse' } : { alignSelf: 'flex-start' },
    ]}>
      {!isMe && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.background }}>
            {(msg.sender_name ?? 'U')[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={[
        { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
        isMe
          ? { backgroundColor: C.orange, borderBottomRightRadius: 4 }
          : { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderBottomLeftRadius: 4 },
      ]}>
        <Text style={[{ fontSize: 15, lineHeight: 20 }, isMe ? { color: C.background } : { color: C.textPrimary }]}>
          {msg.body}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 }}>
          <Text style={{ fontSize: 10, color: isMe ? 'rgba(0,0,0,0.4)' : C.textMuted }}>{msgTime(msg.created_at)}</Text>
          {isMe && (
            <Text style={{ fontSize: 10, fontWeight: '700', color: msg.read ? C.orange : C.textMuted }}>
              {msg.read ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors: C } = useTheme();
  const { id, contractorId } = useLocalSearchParams<{ id: string; contractorId?: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [otherName, setOtherName] = useState('Chat');
  const [myName, setMyName] = useState('Me');
  const [myRole, setMyRole] = useState<'contractor' | 'customer'>('customer');
  const [otherId, setOtherId] = useState('');
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // chat_id is the route param `id`; if someone passes a contractorId, re-derive the correct chatId
  const chatId = id ?? '';

  useEffect(() => {
    if (!chatId) return;
    init();
  }, [chatId]);

  // Realtime
  useEffect(() => {
    if (!chatId) return;
    const ch = subscribeToChatMessages(chatId, newMsg => {
      setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => unsubscribeFromChat(ch);
  }, [chatId]);

  const init = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { setLoading(false); return; }
    setUser(u);

    const parts = chatId.split('_');
    const other = contractorId ?? (parts.length === 2 ? otherUserFromChatId(chatId, u.id) : '');
    setOtherId(other);

    // Parallel: messages, other party info, current user info, booking
    const [msgs, otherCtr, otherUsr, myCtr, myUsr] = await Promise.all([
      getChatMessages(chatId),
      supabase.from('contractors_public').select('id,company_name,avatar_url').eq('id', other).maybeSingle(),
      supabase.from('users').select('id,full_name,avatar_url').eq('id', other).maybeSingle(),
      supabase.from('contractors').select('company_name').eq('id', u.id).maybeSingle(),
      supabase.from('users').select('full_name').eq('id', u.id).maybeSingle(),
    ]);

    setMessages(msgs);
    setOtherName(otherCtr.data?.company_name ?? otherUsr.data?.full_name ?? 'User');
    setMyName(myCtr.data?.company_name ?? myUsr.data?.full_name ?? 'Me');
    setMyRole(myCtr.data ? 'contractor' : 'customer');

    // Booking check (for limit logic + job banner)
    if (other) {
      const { data: b } = await supabase
        .from('bookings')
        .select('id,trade,status')
        .or(
          `and(customer_id.eq.${u.id},contractor_id.eq.${other}),` +
          `and(customer_id.eq.${other},contractor_id.eq.${u.id})`
        )
        .in('status', ['confirmed', 'in_progress', 'completed', 'approved', 'paid'])
        .maybeSingle();
      setBooking(b ?? null);
    }

    markChatRead(chatId).catch(() => null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    setLoading(false);
  };

  const myMessages = messages.filter(m => m.sender_id === user?.id && !m.is_system);
  const hasBooking  = !!booking;
  const limitReached = !hasBooking && myMessages.length >= PRE_BOOKING_LIMIT;

  const handleSend = async () => {
    if (!text.trim() || !user || !otherId || sending) return;
    if (limitReached) {
      Alert.alert('Limit reached', `Book ${otherName} to keep chatting.`);
      return;
    }

    // Confirm on first contact — prevents accidental or bot messages
    if (myMessages.length === 0) {
      const go = await new Promise<boolean>(resolve =>
        Alert.alert(
          `Message ${otherName}?`,
          'This will notify them of your message. Keep it professional — Tradease reviews messages for quality.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Send Message', onPress: () => resolve(true) },
          ],
        )
      );
      if (!go) return;
    }

    setSending(true);
    try {
      const trimmed = text.trim();
      const msg = await sendChatMessage({
        chatId,
        recipientId:  otherId,
        content:      trimmed,
        senderName:   myName,
        senderRole:   myRole,
      });
      setMessages(prev => [...prev, msg]);
      setText('');
      // Non-blocking push to recipient
      sendPushNotification({
        userId:    otherId,
        type:      'new_message',
        title:     myName,
        message:   trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
        actorName: myName,
        icon:      'chatbubble-outline',
        data:      { chat_id: chatId },
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: any) {
      if (err?.message?.includes('PRE_BOOKING_LIMIT_REACHED')) {
        Alert.alert('Limit reached', `You've reached the 3-message limit before booking. Book ${otherName} to keep chatting.`);
        return;
      }
      Alert.alert('Error', err.message);
    } finally {
      setSending(false);
    }
  };

  const s = makeStyles(C);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.container}>

      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <View style={[s.headerAvatar, { backgroundColor: C.orange }]}>
              <Text style={[s.headerAvatarText, { color: C.background }]}>
                {otherName[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={[s.headerName, { color: C.textPrimary }]} numberOfLines={1}>{otherName}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* ── Job context banner ── */}
      {booking && (
        <TouchableOpacity
          style={[s.jobBanner, { backgroundColor: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.2)' }]}
          onPress={() => router.push(`/job/${booking.id}` as any)}
          activeOpacity={0.8}
        >
          <View style={s.jobBannerDot} />
          <Ionicons name="construct-outline" size={14} color="#22C55E" />
          <Text style={[s.jobBannerText, { color: '#22C55E', flex: 1 }]} numberOfLines={1}>
            Active Job · {booking.trade}
          </Text>
          <Text style={[s.jobBannerCta, { color: '#22C55E' }]}>View →</Text>
        </TouchableOpacity>
      )}

      {/* ── Pre-booking info banner ── */}
      {!hasBooking && myMessages.length < PRE_BOOKING_LIMIT && (
        <View style={[s.infoBanner, { backgroundColor: C.orangeDim, borderColor: 'rgba(255,98,0,0.2)' }]}>
          <Ionicons name="chatbubble-outline" size={14} color={C.orange} />
          <Text style={[s.infoBannerText, { color: C.orange }]}>
            {String(PRE_BOOKING_LIMIT - myMessages.length)} free message{PRE_BOOKING_LIMIT - myMessages.length !== 1 ? 's' : ''} remaining before booking
          </Text>
        </View>
      )}

      {/* ── Messages + input ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.messageList}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && (
            <View style={s.emptyChat}>
              <Text style={[s.emptyChatText, { color: C.textMuted }]}>Say hello to start the conversation</Text>
            </View>
          )}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isMe={msg.sender_id === user?.id}
              C={C}
            />
          ))}
        </ScrollView>

        {/* ── Input area ── */}
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.background }}>
          {limitReached ? (
            <View style={[s.limitBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.limitTitle, { color: C.textPrimary }]}>
                  {'Book ' + otherName + ' to keep chatting'}
                </Text>
                <Text style={[s.limitSub, { color: C.textSecondary }]}>
                  {String(PRE_BOOKING_LIMIT) + ' free messages used'}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.bookBtn, { backgroundColor: C.orange }]}
                onPress={() => router.push(`/create-job?contractor=${otherId}` as any)}
              >
                <Text style={[s.bookBtnText, { color: C.background }]}>Book Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.inputBar, { borderTopColor: C.border }]}>
              <TextInput
                style={[s.input, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
                placeholder="Type a message…"
                placeholderTextColor={C.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: (!text.trim() || sending) ? C.border : C.orange }]}
                onPress={handleSend}
                disabled={!text.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator color={C.background} size="small" />
                  : <Ionicons name="arrow-up" size={20} color={C.background} />
                }
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    container:       { flex: 1, backgroundColor: C.background },
    center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border, gap: 12 },
    backBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    headerCenter:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    headerAvatarText:{ fontSize: 14, fontWeight: '800' },
    headerName:      { fontSize: 15, fontWeight: '700', flex: 1 },

    jobBanner:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 0.5 },
    jobBannerDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
    jobBannerText:   { fontSize: 12, fontWeight: '600' },
    jobBannerCta:    { fontSize: 12, fontWeight: '700' },

    infoBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
    infoBannerText:  { fontSize: 12, fontWeight: '600', flex: 1 },

    messageList:     { paddingHorizontal: 16, paddingVertical: 16, gap: 10, paddingBottom: 24 },
    emptyChat:       { alignItems: 'center', paddingTop: 60 },
    emptyChatText:   { fontSize: 14 },

    inputBar:        { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5 },
    input:           { flex: 1, minHeight: 40, maxHeight: 100, borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
    sendBtn:         { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

    limitBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 0.5, gap: 12 },
    limitTitle:      { fontSize: 14, fontWeight: '700' },
    limitSub:        { fontSize: 12, marginTop: 2 },
    bookBtn:         { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
    bookBtnText:     { fontSize: 13, fontWeight: '800' },
  });
}
