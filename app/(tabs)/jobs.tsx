import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NoAccountOverlay from '@/components/NoAccountOverlay';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { formatRemaining } from '@/lib/time';
import ContractorJobFeed from './contractor-home';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS: Record<string, { color: string; label: string }> = {
  draft:       { color: '#94A3B8', label: 'Draft'               },
  pending:     { color: '#FBBF24', label: 'Finding Contractor' },
  accepted:    { color: '#22C55E', label: 'Accepted'           },
  confirmed:   { color: '#22C55E', label: 'Confirmed'          },
  in_progress: { color: '#38BDF8', label: 'In Progress'        },
  completed:   { color: '#9CA3AF', label: 'Awaiting Approval'  },
  approved:    { color: '#A78BFA', label: 'Payment Approved'   },
  paid:        { color: '#22C55E', label: 'Paid'               },
  cancelled:   { color: '#EF4444', label: 'Cancelled'          },
  declined:    { color: '#EF4444', label: 'Declined'           },
};

const TRADE_EMOJI: Record<string, string> = {
  Plumbing: '🔧', Electrical: '⚡', HVAC: '❄️', Carpentry: '🪚',
  Roofing: '🏠', Painting: '🎨', Landscaping: '🌿', Handyman: '🔨',
  Cleaning: '🧹', 'General Contracting': '🏗️',
};

const FILTERS = ['All', 'Active', 'Draft', 'Completed', 'Cancelled'] as const;
type Filter = typeof FILTERS[number];

function matchesFilter(booking: any, f: Filter): boolean {
  const s = booking.status;
  // 'All' means everything relevant, not literally every status — cancelled/declined
  // have their own tab, same reasoning as Delete visually removing a job.
  if (f === 'All') return !['cancelled', 'declined'].includes(s);
  if (f === 'Active') return ['pending','accepted','confirmed','in_progress'].includes(s);
  if (f === 'Draft') return s === 'draft';
  if (f === 'Completed') return ['completed','approved','paid'].includes(s);
  if (f === 'Cancelled') return ['cancelled','declined'].includes(s);
  return true;
}

// ─── Booking card ─────────────────────────────────────────────────────────────
function BookingCard({ booking, onPress, C, isAdmin, onDelete }: {
  booking: any;
  onPress: () => void;
  C: any;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}) {
  const isExpired = booking.status === 'pending'
    && !booking.contractor_id
    && !!booking.request_expires_at
    && new Date(booking.request_expires_at) < new Date();
  const st = isExpired ? { color: '#EF4444', label: 'Expired' } : (STATUS[booking.status] ?? STATUS.pending);
  const emoji = TRADE_EMOJI[booking.trade] ?? '🔧';
  const contractorName = booking.contractor?.company_name;
  const date = new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isPending = booking.status === 'pending';
  const needsApproval = booking.status === 'completed';
  const needsReview = booking.needsReview === true;
  const hasQuote = booking.hasQuote === true;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Top row: trade + status */}
      <View style={styles.cardTop}>
        <View style={[styles.tradePill, { backgroundColor: C.orangeDim, borderColor: C.orange }]}>
          <Text style={styles.tradeEmoji}>{emoji}</Text>
          <Text style={[styles.tradeName, { color: C.orange }]}>{booking.trade}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: st.color + '18' }]}>
          <View style={[styles.statusDot, { backgroundColor: st.color }]} />
          <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      {/* Description */}
      {!!booking.description && (
        <Text style={[styles.description, { color: C.textPrimary }]} numberOfLines={2}>
          {booking.description}
        </Text>
      )}

      {/* Meta row */}
      <View style={styles.cardMeta}>
        <View style={styles.metaLeft}>
          {contractorName ? (
            <>
              <Ionicons name="person-circle-outline" size={13} color={C.textMuted} />
              <Text style={[styles.metaText, { color: C.textSecondary }]} numberOfLines={1}>{contractorName}</Text>
            </>
          ) : isExpired ? (
            <>
              <Ionicons name="time-outline" size={13} color="#EF4444" />
              <Text style={[styles.metaText, { color: '#EF4444' }]}>Expired — no contractor claimed it</Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={13} color="#FBBF24" />
              <Text style={[styles.metaText, { color: '#FBBF24' }]} numberOfLines={1}>
                Searching for contractor...{booking.request_expires_at ? `  ·  ${formatRemaining(booking.request_expires_at)}` : ''}
              </Text>
            </>
          )}
        </View>
        <View style={styles.metaRight}>
          {!!booking.price_estimate && (
            <Text style={[styles.price, { color: C.textPrimary }]}>${booking.price_estimate}</Text>
          )}
          <Text style={[styles.date, { color: C.textMuted }]}>{date}</Text>
        </View>
      </View>

      {/* Action hints */}
      {needsApproval && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.25)' }]}>
          <Ionicons name="receipt-outline" size={13} color="#A78BFA" />
          <Text style={[styles.actionHintText, { color: '#A78BFA' }]}>Invoice ready — tap to review and approve payment</Text>
        </View>
      )}
      {isPending && !hasQuote && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }]}>
          <ActivityIndicator size="small" color="#FBBF24" style={{ transform: [{ scale: 0.65 }] }} />
          <Text style={[styles.actionHintText, { color: '#FBBF24' }]}>Contractors near you are being notified</Text>
        </View>
      )}
      {hasQuote && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }]}>
          <Text style={{ fontSize: 12 }}>💰</Text>
          <Text style={[styles.actionHintText, { color: '#22C55E', fontWeight: '700' }]}>Quote received — tap to accept or counter</Text>
          <Ionicons name="chevron-forward" size={13} color="#22C55E" />
        </View>
      )}
      {needsReview && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(245,166,35,0.06)', borderColor: 'rgba(245,166,35,0.2)' }]}>
          <Text style={{ fontSize: 11, lineHeight: 14 }}>⭐</Text>
          <Text style={[styles.actionHintText, { color: '#F5A623' }]}>Rate your experience — takes 30 seconds</Text>
        </View>
      )}
      {booking.status === 'confirmed' && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(56,189,248,0.06)', borderColor: 'rgba(56,189,248,0.2)' }]}>
          <Ionicons name="shield-outline" size={13} color="#38BDF8" />
          <Text style={[styles.actionHintText, { color: '#38BDF8' }]}>Secure your payment before the job starts — tap to confirm</Text>
        </View>
      )}
      {booking.status === 'draft' && (
        <View style={[styles.actionHint, { backgroundColor: 'rgba(148,163,184,0.06)', borderColor: 'rgba(148,163,184,0.2)' }]}>
          <Ionicons name="create-outline" size={13} color="#94A3B8" />
          <Text style={[styles.actionHintText, { color: '#94A3B8' }]}>Draft — tap to finish and post</Text>
        </View>
      )}
      {isAdmin && booking.status !== 'cancelled' && (
        <TouchableOpacity
          style={[styles.adminDeleteBtn, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' }]}
          onPress={(e) => { e.stopPropagation(); onDelete?.(booking.id); }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="trash-outline" size={14} color="#EF4444" />
          <Text style={styles.adminDeleteText}>Delete</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Customer bookings screen ─────────────────────────────────────────────────
function CustomerBookings() {
  const { colors: C } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.email === 'joegimapa@gmail.com';
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [pendingDraft, setPendingDraft] = useState(false);
  const channelRef = useRef<any>(null);
  const loadRef    = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('bookings')
      .select('id, trade, description, status, price_estimate, created_at, scheduled_at, booking_time, contractor_id, request_mode, request_expires_at, contractor:contractor_id(company_name, avatar_url)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    const rows = data ?? [];
    const approvedIds = rows
      .filter(b => ['approved', 'paid'].includes(b.status))
      .map(b => b.id);
    // Quotes can exist on pending bookings (contractor_id set = quote sent)
    const quotableIds = rows
      .filter(b => ['pending', 'accepted', 'confirmed'].includes(b.status))
      .map(b => b.id);

    let reviewedIds: string[] = [];
    if (approvedIds.length > 0) {
      const { data: existing } = await supabase
        .from('reviews')
        .select('booking_id')
        .in('booking_id', approvedIds);
      reviewedIds = (existing ?? []).map((r: any) => r.booking_id);
    }

    let quotedBookingIds: string[] = [];
    if (quotableIds.length > 0) {
      const { data: offers } = await supabase
        .from('job_offers')
        .select('booking_id')
        .in('booking_id', quotableIds)
        .in('status', ['quoted', 'countered']);
      quotedBookingIds = (offers ?? []).map((o: any) => o.booking_id);
    }

    setBookings(rows.map(b => ({
      ...b,
      needsReview: ['approved', 'paid'].includes(b.status) && !reviewedIds.includes(b.id),
      hasQuote:    quotedBookingIds.includes(b.id),
    })));
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(); }, [load]);

  // Show "resume draft" banner when user logs in with a saved guest draft
  useEffect(() => {
    if (!user?.id) { setPendingDraft(false); return; }
    AsyncStorage.getItem('guestPendingJob').then(v => setPendingDraft(!!v));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channelName = `customer_bookings:${user.id}`;

    // Purge any stale channel with the same name before subscribing.
    // React StrictMode double-invokes effects; Supabase throws if .on() is
    // called on an already-subscribed channel, which is what caused the
    // "cannot add postgres_changes callbacks after subscribe()" crash.
    supabase.getChannels().forEach(ch => {
      if (ch.topic === `realtime:${channelName}`) supabase.removeChannel(ch);
    });

    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${user.id}` }, () => loadRef.current())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  function handleAdminDelete(bookingId: string) {
    Alert.alert('Delete Job', 'Permanently delete this job?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
          setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
        },
      },
    ]);
  }

  const filtered = bookings.filter(b => matchesFilter(b, filter));
  const activeCount = bookings.filter(b => ['pending','accepted','confirmed','in_progress'].includes(b.status)).length;

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['top']}>
      <NoAccountOverlay visible={!user && !authLoading} />

      {/* Resume-draft banner — shown to logged-in users with a saved guest draft */}
      {!!user && pendingDraft && (
        <TouchableOpacity
          style={[styles.draftBanner, { backgroundColor: C.surface, borderBottomColor: C.orange }]}
          onPress={() => router.push('/create-job?resume=1' as any)}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 14 }}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.draftBannerTitle, { color: C.textPrimary }]}>Unfinished job posting</Text>
            <Text style={[styles.draftBannerSub, { color: C.textSecondary }]}>Tap to continue where you left off</Text>
          </View>
          <Text style={{ fontSize: 16, color: C.orange }}>→</Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>My Bookings</Text>
        <TouchableOpacity
          style={[styles.postBtn, { backgroundColor: C.orange }]}
          onPress={() => router.push('/create-job')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.postBtnText}>Post Job</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabs, { borderBottomColor: C.border }]}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={styles.tab} onPress={() => setFilter(f)}>
            <Text style={[styles.tabText, { color: filter === f ? C.orange : C.textMuted }]}>{f}</Text>
            {filter === f && <View style={[styles.tabUnderline, { backgroundColor: C.orange }]} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Active notice bar */}
      {activeCount > 0 && (
        <View style={[styles.activeBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <View style={styles.activeDot} />
          <Text style={[styles.activeBarText, { color: C.textSecondary }]}>
            {activeCount} active job{activeCount !== 1 ? 's' : ''} in progress
          </Text>
        </View>
      )}

      {loading
        ? <View style={styles.center}><ActivityIndicator color={C.orange} size="large" /></View>
        : <FlatList
        data={filtered}
        keyExtractor={b => b.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.orange}
          />
        }
        ListHeaderComponent={
          <View style={[styles.policyCard, { borderColor: 'rgba(251,191,36,0.2)', backgroundColor: 'rgba(251,191,36,0.04)' }]}>
            <Ionicons name="information-circle-outline" size={15} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.policyTitle, { color: '#FBBF24' }]}>Cancellation Policy</Text>
              <Text style={[styles.policyBody, { color: C.textMuted }]}>
                Free before you confirm a contractor's quote · $30 fee to the contractor after
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            C={C}
            onPress={() => item.status === 'draft'
              ? router.push(`/create-job?draftId=${item.id}&resume=1` as any)
              : router.push(`/job/${item.id}` as any)
            }
            isAdmin={isAdmin}
            onDelete={handleAdminDelete}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
            <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>
              {filter === 'All' ? 'No bookings yet' : `No ${filter.toLowerCase()} jobs`}
            </Text>
            <Text style={[styles.emptySub, { color: C.textMuted }]}>
              {filter === 'All'
                ? 'Post a job to get matched with a contractor near you.'
                : 'Jobs in this category will appear here.'}
            </Text>
            {filter === 'All' && (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: C.orange }]}
                onPress={() => router.push('/create-job')}
              >
                <Text style={styles.emptyBtnText}>Post a Job</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
      }
    </SafeAreaView>
  );
}

// ─── Tab root ─────────────────────────────────────────────────────────────────
export default function JobsTab() {
  const { isContractor, loading } = useRole();
  const { colors: C } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
        <ActivityIndicator color={C.orange} size="large" />
      </View>
    );
  }

  return isContractor ? <ContractorJobFeed /> : <CustomerBookings />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  headerTitle:    { fontSize: 20, fontWeight: '800' },
  postBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  postBtnText:    { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabs:           { flexDirection: 'row', borderBottomWidth: 0.5, paddingHorizontal: 4 },
  tab:            { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
  tabText:        { fontSize: 12, fontWeight: '600' },
  tabUnderline:   { position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, borderRadius: 1 },

  activeBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 0.5 },
  activeDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  activeBarText:  { fontSize: 12, fontWeight: '500' },

  list:           { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100, gap: 10 },

  card:           { borderRadius: 12, borderWidth: 0.5, padding: 14, gap: 8 },
  cardTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tradePill:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  tradeEmoji:     { fontSize: 13 },
  tradeName:      { fontSize: 12, fontWeight: '700' },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 4 },
  statusDot:      { width: 5, height: 5, borderRadius: 3 },
  statusLabel:    { fontSize: 11, fontWeight: '600' },
  description:    { fontSize: 13, lineHeight: 18 },
  cardMeta:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metaLeft:       { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaText:       { fontSize: 12, flex: 1 },
  metaRight:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price:          { fontSize: 13, fontWeight: '700' },
  date:           { fontSize: 11 },
  actionHint:       { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 7, borderWidth: 0.5, padding: 9 },
  actionHintText:   { fontSize: 11, fontWeight: '500', flex: 1 },
  adminDeleteBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 7, borderWidth: 0.5, padding: 8, marginTop: 2 },
  adminDeleteText:  { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  policyCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 0.5, padding: 11, marginBottom: 4 },
  policyTitle:      { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  policyBody:       { fontSize: 11, lineHeight: 16 },

  draftBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1.5 },
  draftBannerTitle: { fontSize: 13, fontWeight: '700' },
  draftBannerSub:   { fontSize: 11, marginTop: 1 },

  empty:          { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub:       { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:       { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
