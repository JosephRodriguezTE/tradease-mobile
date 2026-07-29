import NoAccountOverlay from '@/components/NoAccountOverlay';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import { supabase } from '../../lib/supabase';
import { type ChatSummary, getChatList } from '../../lib/messageService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Chat Row ─────────────────────────────────────────────────────────────────

function ChatRow({ item, onPress, C }: { item: ChatSummary; onPress: () => void; C: any }) {
  const initial = (item.otherName[0] ?? '?').toUpperCase();
  const preview = item.lastMessage.length > 45
    ? item.lastMessage.slice(0, 45) + '…'
    : item.lastMessage || 'Tap to open chat';

  const cardStyle = item.hasActiveJob
    ? [row.card, { backgroundColor: C.surface, borderColor: 'rgba(34,197,94,0.35)' }]
    : [row.card, { backgroundColor: C.surface, borderColor: C.border }];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Avatar */}
      <View style={{ position: 'relative', flexShrink: 0 }}>
        <View style={[row.avatar, { backgroundColor: item.hasActiveJob ? 'rgba(34,197,94,0.15)' : C.orangeDim }]}>
          <Text style={[row.avatarText, { color: item.hasActiveJob ? '#22C55E' : C.orange }]}>{initial}</Text>
        </View>
        {/* Active job pulse dot */}
        {item.hasActiveJob && (
          <View style={row.activeDot} />
        )}
        {/* Unread dot (only when no active job indicator) */}
        {!item.hasActiveJob && item.unread > 0 && (
          <View style={[row.unreadDot, { backgroundColor: C.orange, borderColor: C.surface }]} />
        )}
      </View>

      <View style={row.body}>
        {/* Name row */}
        <View style={row.top}>
          <Text style={[row.name, { color: C.textPrimary }]} numberOfLines={1}>{item.otherName}</Text>
          <Text style={[row.time, { color: C.textMuted }]}>{timeAgo(item.lastTime)}</Text>
        </View>

        {/* Active job badge */}
        {item.hasActiveJob && (
          <View style={row.activeJobRow}>
            <View style={row.activeJobPill}>
              <View style={row.activeJobDot} />
              <Text style={row.activeJobText}>Active Job</Text>
              {item.activeJobTrade ? (
                <Text style={row.activeJobTrade}>· {item.activeJobTrade}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Preview + unread badge */}
        <View style={row.bottom}>
          <Text
            style={[row.preview, { color: item.unread > 0 ? C.textPrimary : C.textSecondary }]}
            numberOfLines={1}
          >
            {item.isSystem ? preview : preview}
          </Text>
          {item.unread > 0 && (
            <View style={[row.badge, { backgroundColor: item.hasActiveJob ? '#22C55E' : C.orange }]}>
              <Text style={row.badgeText}>{item.unread > 99 ? '99+' : String(item.unread)}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  card:           { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 8 },
  avatar:         { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 18, fontWeight: '800' },
  activeDot:      { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#13131A' },
  unreadDot:      { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  body:           { flex: 1, gap: 3 },
  top:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name:           { fontSize: 15, fontWeight: '700', flex: 1 },
  time:           { fontSize: 11, flexShrink: 0 },
  activeJobRow:   { flexDirection: 'row' },
  activeJobPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 0.5, borderColor: 'rgba(34,197,94,0.3)' },
  activeJobDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  activeJobText:  { fontSize: 11, fontWeight: '700', color: '#22C55E' },
  activeJobTrade: { fontSize: 11, color: '#22C55E', opacity: 0.75 },
  bottom:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  preview:        { fontSize: 13, flex: 1 },
  badge:          { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText:      { fontSize: 10, fontWeight: '800', color: '#fff' },
});

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ visible, onClose, userId, C }: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  C: any;
}) {
  const router = useRouter();
  const [search,       setSearch]       = useState('');
  const [contractors,  setContractors]  = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [opening,      setOpening]      = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setSearch(''); return; }
    setLoading(true);
    supabase
      .from('contractors_public')
      .select('id, company_name, trade_type, is_available')
      .eq('verification_status', 'approved')
      .order('company_name')
      .then(({ data }) => { setContractors(data ?? []); setLoading(false); });
  }, [visible]);

  const filtered = search.trim()
    ? contractors.filter(c =>
        c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.trade_type?.toLowerCase().includes(search.toLowerCase())
      )
    : contractors;

  async function openOrCreate(contractorId: string) {
    setOpening(contractorId);
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_id', userId)
        .eq('contractor_id', contractorId)
        .maybeSingle();

      if (existing) {
        onClose();
        router.push(`/chat/${existing.id}` as any);
        return;
      }

      const contractor = contractors.find(c => c.id === contractorId);
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          `Contact ${contractor?.company_name ?? 'Contractor'}?`,
          'Only reach out if you\'re genuinely interested in hiring them.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Start Chat', onPress: () => resolve(true) },
          ],
        )
      );
      if (!confirmed) { setOpening(null); return; }

      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          customer_id:     userId,
          contractor_id:   contractorId,
          contractor_name: contractor?.company_name ?? '',
          status:          'pending',
        })
        .select('id')
        .single();

      if (error) throw error;
      onClose();
      router.push(`/chat/${newConv.id}` as any);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not open conversation.');
    } finally {
      setOpening(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', borderTopWidth: 0.5, borderColor: C.border }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.textPrimary }}>New Message</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>Choose a contractor to message</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, borderRadius: 12, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: 14, height: 44 }}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: C.textPrimary }}
                placeholder="Search by name or trade..."
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
          </View>

          {/* List */}
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={C.orange} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 15, color: C.textMuted, textAlign: 'center' }}>No contractors found</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {filtered.map((c) => {
                const initials = (c.company_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
                const isOpening = opening === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border }}
                    onPress={() => openOrCreate(c.id)}
                    disabled={isOpening}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.background }}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.textPrimary }}>{c.company_name}</Text>
                      {c.trade_type && (
                        <Text style={{ fontSize: 13, color: C.orange, marginTop: 1 }}>{c.trade_type}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.is_available ? '#22C55E' : C.textMuted }} />
                      {isOpening
                        ? <ActivityIndicator size="small" color={C.orange} />
                        : <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                      }
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isContractor } = useRole();

  const [chats,         setChats]         = useState<ChatSummary[]>([]);
  const [search,        setSearch]        = useState('');
  const [loading,       setLoading]       = useState(true);
  const [composeOpen,   setComposeOpen]   = useState(false);
  const channelRef = useRef<any>(null);

  const load = async () => {
    if (!user) return;
    try {
      const { summaries } = await getChatList();
      setChats(summaries);
    } catch (e) {
      console.warn('getChatList error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || authLoading) return;
    load();
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;

    const channelId = `msg_tab:${user.id}:${Math.random().toString(36).slice(2, 7)}`;
    const ch = supabase
      .channel(channelId)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => load())
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const filtered = search.trim()
    ? chats.filter(c => c.otherName.toLowerCase().includes(search.toLowerCase()))
    : chats;

  const s = makeStyles(C);

  if (authLoading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <NoAccountOverlay visible={!user && !authLoading} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Messages</Text>
        </View>
        {chats.length > 0 && (
          <Text style={s.count}>{String(chats.length)}</Text>
        )}
        {/* Compose button — customers only */}
        {!isContractor && !!user && (
          <TouchableOpacity
            onPress={() => setComposeOpen(true)}
            style={[s.composeBtn, { backgroundColor: C.orange }]}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={[s.searchBar, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput
            style={[s.searchInput, { color: C.textPrimary }]}
            placeholder="Search conversations…"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="chatbubbles-outline" size={56} color={C.textMuted} />
          <Text style={[s.emptyTitle, { color: C.textPrimary }]}>No messages yet</Text>
          <Text style={[s.emptySub, { color: C.textSecondary }]}>
            Messages from contractors and customers will appear here.
          </Text>
          {!isContractor && !!user && (
            <TouchableOpacity
              style={[s.cta, { backgroundColor: C.orange }]}
              onPress={() => setComposeOpen(true)}
            >
              <Text style={[s.ctaText, { color: C.background }]}>Message a Contractor</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.chatId}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ChatRow
              item={item}
              C={C}
              onPress={() => router.push(`/chat/${item.chatId}` as any)}
            />
          )}
        />
      )}

      {/* Compose modal — customers only */}
      {!isContractor && !!user && (
        <ComposeModal
          visible={composeOpen}
          onClose={() => setComposeOpen(false)}
          userId={user.id}
          C={C}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: C.background },
    center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 10 },
    title:       { fontSize: 26, fontWeight: '800', color: C.textPrimary },
    count:       { fontSize: 13, fontWeight: '700', color: C.orange },
    composeBtn:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    searchWrap:  { paddingHorizontal: 16, paddingVertical: 10 },
    searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 14, height: 44 },
    searchInput: { flex: 1, fontSize: 14 },
    list:        { paddingHorizontal: 16, paddingBottom: 100 },
    empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
    emptyTitle:  { fontSize: 20, fontWeight: '800', marginTop: 12 },
    emptySub:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
    cta:         { marginTop: 16, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
    ctaText:     { fontSize: 15, fontWeight: '800' },
  });
}
