import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SectionList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font, Radius } from '../constants/theme';

const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return 'Just now';
}

const TYPE_ACCENT: Record<string, string> = {
  job_accepted:                     '#22C55E',
  contractor_assigned:              '#22C55E',
  new_message:                      '#A78BFA',
  job_completed:                    '#38BDF8',
  payment_approved:                 '#FBBF24',
  new_job_nearby:                   '#FF6200',
  booking_cancelled_by_contractor:  '#EF4444',
  booking_cancelled:                '#EF4444',
};

function getAccent(type: string): string {
  return TYPE_ACCENT[type] ?? '#9090A8';
}

// Group notifications by date label
function groupByDate(notifications: any[]): { title: string; data: any[] }[] {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const map: Record<string, any[]> = {};

  for (const n of notifications) {
    const ds = new Date(n.created_at).toDateString();
    let label: string;
    if (ds === today)     label = 'Today';
    else if (ds === yesterday) label = 'Yesterday';
    else label = new Date(n.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    });
    if (!map[label]) map[label] = [];
    map[label].push(n);
  }

  return Object.entries(map).map(([title, data]) => ({ title, data }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [notifications,       setNotifications]       = useState<any[]>([]);
  const [loading,             setLoading]             = useState(true);
  const [refreshing,          setRefreshing]          = useState(false);
  const [cancelActionNotif,   setCancelActionNotif]   = useState<any>(null);
  const [savingDraft,         setSavingDraft]         = useState(false);
  const channelRef = useRef<any>(null);

  const load = useCallback(async (quiet = false) => {
    if (!user) return;
    if (!quiet) setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications(data ?? []);
    if (!quiet) setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;

    const channelName = `notifications:${user.id}`;

    // Purge any stale channel with the same name before subscribing.
    // React StrictMode double-invokes effects; Supabase throws if .on() is
    // called on an already-subscribed channel, which is what caused the
    // "cannot add postgres_changes callbacks after subscribe()" crash.
    supabase.getChannels().forEach(ch => {
      if (ch.topic === `realtime:${channelName}`) supabase.removeChannel(ch);
    });

    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
      })
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  async function markOneRead(notifId: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  }

  async function handleTap(notif: any) {
    if (!notif.read) await markOneRead(notif.id);

    const data = notif.data ?? {};
    switch (notif.type) {
      case 'job_accepted':
      case 'contractor_assigned':
        if (data.chat_id) router.push(`/chat/${data.chat_id}` as any);
        else if (data.booking_id) router.push(`/job/${data.booking_id}` as any);
        break;
      case 'new_message':
        if (data.chat_id) router.push(`/chat/${data.chat_id}` as any);
        break;
      case 'job_completed':
        if (data.booking_id) router.push(`/work-order/customer?id=${data.booking_id}` as any);
        break;
      case 'payment_approved':
        if (data.work_order_id) router.push(`/work-order/contractor?id=${data.work_order_id}` as any);
        break;
      case 'quote_received':
      case 'counter_received':
      case 'quote_accepted':
      case 'quote_declined':
        if (data.booking_id) router.push(`/job/${data.booking_id}` as any);
        break;
      case 'new_job_nearby':
      case 'new_job':
        router.push('/(tabs)/' as any);
        break;
      case 'booking_cancelled_by_contractor':
        setCancelActionNotif(notif);
        break;
      default:
        break;
    }
  }

  async function handleSaveDraft(notif: any) {
    if (!user) return;
    setSavingDraft(true);
    const d = notif.data ?? {};
    try {
      await supabase.from('bookings').insert({
        customer_id:  user.id,
        trade:        d.trade  ?? '',
        description:  d.description ?? '',
        status:       'draft',
      });
    } catch (_) {}
    setSavingDraft(false);
    setCancelActionNotif(null);
    Alert.alert('Draft saved', 'Your job was saved as a draft in My Bookings.');
  }

  async function markAllRead() {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function handleClear() {
    Alert.alert('Clear all?', 'This will delete all your notifications.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await supabase.from('notifications').delete().eq('user_id', user!.id);
        setNotifications([]);
      }},
    ]);
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const sections    = groupByDate(notifications);
  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={[s.headerBadge, { backgroundColor: C.orange }]}>
              <Text style={s.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={notifications.length > 0 ? handleClear : undefined}
          disabled={notifications.length === 0}
          style={{ opacity: notifications.length === 0 ? 0.3 : 1 }}
        >
          <Text style={[s.clearBtn, { color: C.orange }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Mark all read strip */}
      {unreadCount > 0 && (
        <TouchableOpacity style={[s.markAllRow, { borderBottomColor: C.border }]} onPress={markAllRead}>
          <Ionicons name="checkmark-done-outline" size={15} color={C.orange} />
          <Text style={[s.markAllText, { color: C.orange }]}>Mark all as read</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={C.orange}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={s.sectionHeader}>
              <Text style={[s.sectionHeaderText, { color: C.textMuted }]}>{title}</Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={52} color={C.textMuted} />
              <Text style={[s.emptyTitle, { color: C.textPrimary }]}>No notifications yet</Text>
              <Text style={[s.emptySub, { color: C.textMuted }]}>
                Updates about your jobs, messages, and payments will appear here.
              </Text>
            </View>
          )}
          ListFooterComponent={<View style={{ height: SP[10] }} />}
          renderItem={({ item: notif }) => {
            const accent   = getAccent(notif.type);
            const iconName = notif.icon ?? 'notifications-outline';
            return (
              <TouchableOpacity
                style={[
                  s.card,
                  { backgroundColor: C.surface, borderColor: C.border },
                  !notif.read && { borderLeftWidth: 3, borderLeftColor: accent },
                ]}
                onPress={() => handleTap(notif)}
                activeOpacity={0.75}
              >
                {/* Icon box */}
                <View style={[s.iconBox, { backgroundColor: accent + '20' }]}>
                  <Ionicons name={iconName as any} size={20} color={accent} />
                </View>

                {/* Text */}
                <View style={s.textCol}>
                  {notif.title ? (
                    <Text style={[s.cardTitle, { color: C.textPrimary }]} numberOfLines={1}>
                      {notif.title}
                    </Text>
                  ) : null}
                  {notif.message ? (
                    <Text style={[s.cardBody, { color: C.textSecondary }]} numberOfLines={2}>
                      {notif.message}
                    </Text>
                  ) : null}
                  <Text style={[s.cardTime, { color: C.textMuted }]}>
                    {timeAgo(notif.created_at)}
                  </Text>
                </View>

                {/* Unread: mark-as-read button or dot */}
                {!notif.read ? (
                  <TouchableOpacity
                    style={[s.markReadBtn, { borderColor: accent + '50' }]}
                    onPress={(e) => { e.stopPropagation(); markOneRead(notif.id); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[s.unreadDot, { backgroundColor: accent }]} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Contractor-cancelled action sheet */}
      <Modal
        visible={!!cancelActionNotif}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Alert.alert('Discard?', 'Close without taking action?', [
            { text: 'Stay', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: () => setCancelActionNotif(null) },
          ]);
        }}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity
            style={s.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              Alert.alert('Discard?', 'Close without taking action?', [
                { text: 'Stay', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => setCancelActionNotif(null) },
              ]);
            }}
          />
          <View style={[s.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={s.modalHandle} />

            {/* Close button */}
            <TouchableOpacity
              style={s.modalClose}
              onPress={() => {
                Alert.alert('Discard?', 'Close without taking action?', [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => setCancelActionNotif(null) },
                ]);
              }}
            >
              <Ionicons name="close" size={20} color={C.textMuted} />
            </TouchableOpacity>

            <Text style={[s.modalTitle, { color: C.textPrimary }]}>Your booking was cancelled</Text>
            <Text style={[s.modalSub, { color: C.textSecondary }]}>
              {cancelActionNotif?.data?.contractor_name ?? 'The contractor'} cancelled your{' '}
              {cancelActionNotif?.data?.trade ?? 'job'} booking. What would you like to do?
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalActionBtn, { backgroundColor: C.orange }]}
                onPress={() => { setCancelActionNotif(null); router.push('/create-job' as any); }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#0A0A0A" />
                <Text style={[s.modalActionText, { color: '#0A0A0A' }]}>Post New Job</Text>
              </TouchableOpacity>

              {!!cancelActionNotif?.data?.contractor_id && (
                <TouchableOpacity
                  style={[s.modalActionBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                  onPress={() => {
                    setCancelActionNotif(null);
                    router.push(`/company/${cancelActionNotif.data.contractor_id}` as any);
                  }}
                >
                  <Ionicons name="business-outline" size={20} color={C.textPrimary} />
                  <Text style={[s.modalActionText, { color: C.textPrimary }]}>Request Company Card</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[s.modalActionBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                onPress={() => handleSaveDraft(cancelActionNotif)}
                disabled={savingDraft}
              >
                {savingDraft
                  ? <ActivityIndicator color={C.orange} size="small" />
                  : <>
                      <Ionicons name="bookmark-outline" size={20} color={C.textPrimary} />
                      <Text style={[s.modalActionText, { color: C.textPrimary }]}>Save as Draft</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: C.background },
    center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border },
    backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerCenter:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2] },
    headerTitle:   { fontSize: TY.md, fontWeight: Font.black, color: C.textPrimary, letterSpacing: -0.3 },
    headerBadge:   { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
    headerBadgeText: { fontSize: TY.xs, fontWeight: Font.black, color: '#fff' },
    clearBtn:      { fontSize: TY.sm, fontWeight: Font.semibold },

    markAllRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], paddingVertical: SP[2], borderBottomWidth: 0.5 },
    markAllText:   { fontSize: TY.sm, fontWeight: Font.bold },

    sectionHeader:     { paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[2] },
    sectionHeaderText: { fontSize: TY.xs, fontWeight: Font.black, letterSpacing: 0.8, textTransform: 'uppercase' },

    listContent:   { paddingHorizontal: SP[4], paddingTop: SP[2], gap: SP[2] },

    card: {
      flexDirection: 'row', alignItems: 'center', gap: SP[3],
      borderRadius: Radius.lg, borderWidth: 0.5,
      padding: SP[3], overflow: 'hidden',
    },
    iconBox:       { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    textCol:       { flex: 1, gap: 3 },
    cardTitle:     { fontSize: TY.sm, fontWeight: Font.bold, lineHeight: 18 },
    cardBody:      { fontSize: TY.sm, lineHeight: 18 },
    cardTime:      { fontSize: TY.xs, marginTop: 2 },

    markReadBtn:   { padding: 4, borderRadius: 8, borderWidth: 1 },
    unreadDot:     { width: 8, height: 8, borderRadius: 4 },

    empty:         { alignItems: 'center', paddingTop: 80, paddingHorizontal: SP[8], gap: SP[3] },
    emptyTitle:    { fontSize: TY.lg, fontWeight: Font.black },
    emptySub:      { fontSize: TY.sm, textAlign: 'center', lineHeight: 21 },

    modalOverlay:    { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 0.5, padding: SP[4], paddingBottom: SP[8], gap: SP[3] },
    modalHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A', alignSelf: 'center', marginBottom: SP[2] },
    modalClose:      { position: 'absolute', top: SP[4], right: SP[4], width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    modalTitle:      { fontSize: TY.md, fontWeight: Font.black, letterSpacing: -0.3 },
    modalSub:        { fontSize: TY.sm, lineHeight: 20 },
    modalActions:    { gap: SP[2], marginTop: SP[1] },
    modalActionBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: Radius.lg, paddingVertical: SP[4] },
    modalActionText: { fontSize: TY.base, fontWeight: Font.bold },
  });
}
