// app/work-order/chat.tsx
// Work order chat — Phase 3
// Unlimited messages, open from quote accepted through completion + 30 days archived.

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ─── Theme ────────────────────────────────────────────────────────────────────

const C = {
  bg:     '#0D0D0D',
  card:   '#161616',
  border: '#262626',
  orange: '#FF6200',
  green:  '#22C55E',
  txt:    '#F0F0F0',
  txt2:   '#9A9A9A',
  txt3:   '#444',
  me:     '#FF6200',
  them:   '#1E1E1E',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WoMessage {
  id: string;
  work_order_id: string;
  sender_id: string;
  body: string | null;
  media_path: string | null;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  _sender_name?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getDate() - d.getDate();
  if (diff === 0 && now.getMonth() === d.getMonth()) return 'Today';
  if (diff === 1 && now.getMonth() === d.getMonth()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function Bubble({ msg, isMe, publicUrl }: { msg: WoMessage; isMe: boolean; publicUrl: string | null }) {
  if (msg.deleted_at) {
    return (
      <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
        <Text style={styles.deleted}>Message deleted</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {publicUrl ? (
          <Image source={{ uri: publicUrl }} style={styles.mediaThumb} resizeMode="cover" />
        ) : null}
        {msg.body ? (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {msg.body}
          </Text>
        ) : null}
        <Text style={[styles.timeText, isMe ? { color: 'rgba(255,255,255,0.5)' } : { color: C.txt3 }]}>
          {fmtTime(msg.created_at)}
          {isMe && msg.read_at ? '  ✓✓' : ''}
        </Text>
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WorkOrderChatScreen() {
  const { work_order_id } = useLocalSearchParams<{ work_order_id: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const { user }  = useAuth();

  const [messages,   setMessages]   = useState<WoMessage[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [draft,      setDraft]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [otherName,  setOtherName]  = useState('');
  const [publicUrls, setPublicUrls] = useState<Record<string, string>>({});

  const listRef = useRef<FlatList>(null);

  // ── Load messages ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!work_order_id || !user) return;

    // Fetch work order to get both parties
    const { data: wo } = await supabase
      .from('work_orders')
      .select('contractor_id, customer_id, contractor_name, customer_name')
      .eq('id', work_order_id)
      .maybeSingle();

    if (wo) {
      const isContractor = wo.contractor_id === user.id;
      setOtherName(isContractor ? (wo.customer_name ?? 'Customer') : (wo.contractor_name ?? 'Contractor'));
    }

    const { data } = await supabase
      .from('work_order_messages')
      .select('*')
      .eq('work_order_id', work_order_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const msgs = (data ?? []) as WoMessage[];
    setMessages(msgs);

    // Resolve media URLs
    const urls: Record<string, string> = {};
    for (const m of msgs) {
      if (m.media_path) {
        const { data } = await supabase.storage.from('work-orders').createSignedUrl(m.media_path, 3600);
        if (data?.signedUrl) urls[m.id] = data.signedUrl;
      }
    }
    setPublicUrls(urls);

    // Stamp read_at on unread messages from the other party
    const unread = msgs.filter(m => !m.read_at && m.sender_id !== user.id);
    if (unread.length > 0) {
      await supabase
        .from('work_order_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map(m => m.id));
    }

    setLoading(false);
  }, [work_order_id, user]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!work_order_id || !user) return;

    const ch = supabase
      .channel(`wo_chat_${work_order_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'work_order_messages', filter: `work_order_id=eq.${work_order_id}` },
        async (payload) => {
          const msg = payload.new as WoMessage;
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          // Resolve media URL if needed
          if (msg.media_path) {
            const { data } = await supabase.storage.from('work-orders').createSignedUrl(msg.media_path, 3600);
            if (data?.signedUrl) setPublicUrls(prev => ({ ...prev, [msg.id]: data.signedUrl }));
          }

          // Auto-stamp read if the message is from the other party
          if (msg.sender_id !== user.id) {
            await supabase
              .from('work_order_messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', msg.id);
          }

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_order_messages', filter: `work_order_id=eq.${work_order_id}` },
        (payload) => {
          const updated = payload.new as WoMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [work_order_id, user]);

  // ── Send text message ─────────────────────────────────────────────────────
  async function sendMessage() {
    const text = draft.trim();
    if (!text || !user || !work_order_id || sending) return;
    setDraft('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await supabase.from('work_order_messages').insert({
      work_order_id,
      sender_id: user.id,
      body: text,
    });
    setSending(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  // ── Send image ────────────────────────────────────────────────────────────
  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0] || !user || !work_order_id) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext   = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path  = `${work_order_id}/chat/${Date.now()}.${ext}`;
      const blob  = await (await fetch(asset.uri)).blob();
      const mime  = ext === 'png' ? 'image/png' : 'image/jpeg';

      const { error: upErr } = await supabase.storage.from('work-orders').upload(path, blob, { contentType: mime });
      if (upErr) throw upErr;

      await supabase.from('work_order_messages').insert({
        work_order_id,
        sender_id: user.id,
        media_path: path,
        body: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setUploading(false);
  }

  // ── Render item ───────────────────────────────────────────────────────────
  function renderItem({ item, index }: { item: WoMessage; index: number }) {
    const prev = messages[index - 1];
    const showDay = !prev || !isSameDay(prev.created_at, item.created_at);
    const isMe    = item.sender_id === user?.id;

    return (
      <>
        {showDay && (
          <View style={styles.daySep}>
            <View style={styles.daySepLine} />
            <Text style={styles.daySepTxt}>{dayLabel(item.created_at)}</Text>
            <View style={styles.daySepLine} />
          </View>
        )}
        <Bubble msg={item} isMe={isMe} publicUrl={publicUrls[item.id] ?? null} />
      </>
    );
  }

  const isReadOnly = false; // TODO: set true 30 days after wo.completed_at

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={C.txt} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{otherName || 'Chat'}</Text>
          <Text style={styles.headerSub}>Work Order</Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.orange} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, paddingBottom: 8 }}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyTxt}>No messages yet. Say hi!</Text>
              </View>
            }
          />
        )}

        {/* Input */}
        {!isReadOnly && (
          <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
            <Pressable
              style={styles.attachBtn}
              onPress={pickImage}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Attach image"
            >
              {uploading
                ? <ActivityIndicator size="small" color={C.orange} />
                : <Ionicons name="image-outline" size={22} color={C.txt2} />}
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={C.txt3}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <Pressable
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backBtn:     { padding: 6, marginRight: 4 },
  headerTitle: { color: C.txt, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  headerSub:   { color: C.txt2, fontSize: 12, fontFamily: 'Inter_400Regular' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt:    { color: C.txt2, fontSize: 14 },

  row:    { marginBottom: 4, maxWidth: '80%' },
  rowMe:  { alignSelf: 'flex-end' },
  rowThem:{ alignSelf: 'flex-start' },

  bubble:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 280 },
  bubbleMe:    { backgroundColor: C.me, borderBottomRightRadius: 4 },
  bubbleThem:  { backgroundColor: C.them, borderBottomLeftRadius: 4 },
  bubbleText:  { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  bubbleTextMe:   { color: '#fff' },
  bubbleTextThem: { color: C.txt },
  timeText:    { fontSize: 10, marginTop: 4, fontFamily: 'Inter_400Regular' },
  deleted:     { color: C.txt3, fontSize: 13, fontStyle: 'italic' },

  mediaThumb: { width: 200, height: 150, borderRadius: 10, marginBottom: 4 },

  daySep:     { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 8 },
  daySepLine: { flex: 1, height: 1, backgroundColor: C.border },
  daySepTxt:  { color: C.txt2, fontSize: 11, fontFamily: 'Inter_500Medium' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.card,
    gap: 8,
  },
  attachBtn: { padding: 8, marginBottom: 4 },
  input: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.txt,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    maxHeight: 120,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: '#333' },
});
