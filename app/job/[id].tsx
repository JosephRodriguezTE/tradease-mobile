import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Font, Radius } from '../../constants/theme';
import { deriveChatId } from '../../lib/messageService';
import { formatRemaining } from '../../lib/time';
import { supabase } from '../../lib/supabase';
import { QuoteBottomSheet } from '../(tabs)/contractor-home';

const { width } = Dimensions.get('window');
const CARD_W = (width - Spacing.lg * 2 - 10) / 2;

const TRADE_EMOJI: Record<string, string> = {
  Plumbing: '🔧', Electrical: '⚡', HVAC: '❄️', Carpentry: '🪚',
  Roofing: '🏠', Painting: '🎨', Landscaping: '🌿', Handyman: '🔨',
  Flooring: '🪵', Drywall: '🧱', Masonry: '🪨', 'General Contracting': '🏗️',
};

const PLAN_META: Record<string, { label: string; color: string }> = {
  free:  { label: 'FREE',  color: '#9A9A9A' },
  leads: { label: 'LEADS', color: '#FF6200' },
  pro:   { label: 'PRO',   color: '#FBBF24' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  pending:     { color: '#FBBF24', label: 'Finding Contractor', icon: '⏳' },
  accepted:    { color: '#22C55E', label: 'Accepted',           icon: '✅' },
  confirmed:   { color: '#22C55E', label: 'Confirmed',          icon: '✅' },
  in_progress: { color: '#38BDF8', label: 'In Progress',        icon: '🔧' },
  completed:   { color: '#9CA3AF', label: 'Completed',          icon: '☑️' },
  approved:    { color: '#A78BFA', label: 'Payment Approved',   icon: '💳' },
  paid:        { color: '#22C55E', label: 'Paid',               icon: '💰' },
  cancelled:   { color: '#EF4444', label: 'Cancelled',          icon: '❌' },
  declined:    { color: '#EF4444', label: 'Declined',           icon: '❌' },
  draft:       { color: '#666',    label: 'Draft',              icon: '📝' },
};

function CompanyCard({ contractor }: { contractor: any }) {
  const router = useRouter();
  const { colors: C } = useTheme();

  const avatarUrl   = contractor?.avatar_url?.trim() || null;
  const displayName = contractor?.company_name ?? 'Contractor';
  const initials    = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const planMeta    = PLAN_META[contractor?.plan ?? 'free'] ?? PLAN_META.free;
  const isVerified  = contractor?.verification_status === 'approved' || contractor?.verified;
  const isTrusted   = !!(
    contractor?.company_name?.trim() &&
    contractor?.phone?.trim() &&
    contractor?.location?.trim() &&
    contractor?.avatar_url?.trim() &&
    contractor?.username?.trim()
  );
  const specs: string[] = contractor?.specializations ?? [];

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 16, gap: 12 }}>

      {/* Top row: avatar + name + badges + rating */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,98,0,0.13)', borderWidth: 1.5, borderColor: 'rgba(255,98,0,0.3)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {avatarUrl ? (
            <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden' }}>
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
          ) : (
            <Text style={{ fontSize: 18, fontWeight: Font.black, color: '#FF6200' }}>{initials}</Text>
          )}
          {isTrusted && (
            <View style={{ position: 'absolute', bottom: -4, left: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.background }}>
              <Ionicons name="shield-checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Name + plan/verified badges */}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: Font.black, color: C.textPrimary, letterSpacing: -0.3 }} numberOfLines={1}>{displayName}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: planMeta.color + '18', borderColor: planMeta.color + '40' }}>
              <Text style={{ fontSize: 10, fontWeight: Font.black, color: planMeta.color }}>{planMeta.label}</Text>
            </View>
            {isVerified && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }}>
                <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
                <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#22C55E' }}>VERIFIED</Text>
              </View>
            )}
            {contractor?.is_available && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#22C55E' }} />
                <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#22C55E' }}>ONLINE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Rating */}
        {!!contractor?.rating && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.orangeDim, borderWidth: 0.5, borderColor: C.orange }}>
            <Ionicons name="star" size={12} color={C.orange} />
            <Text style={{ fontSize: 13, fontWeight: Font.black, color: C.orange }}>{Number(contractor.rating).toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Meta row: trade + location + review count */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {!!contractor?.trade_type && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="construct-outline" size={13} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.trade_type}</Text>
          </View>
        )}
        {!!contractor?.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="location-outline" size={13} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.location}</Text>
          </View>
        )}
        {contractor?.review_count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="chatbubble-outline" size={12} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.review_count} reviews</Text>
          </View>
        )}
      </View>

      {/* Tagline / description */}
      {!!(contractor?.tagline || contractor?.description) && (
        <Text style={{ fontSize: 13, lineHeight: 20, color: C.textSecondary, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 12 }} numberOfLines={3}>
          {contractor.tagline ?? contractor.description}
        </Text>
      )}

      {/* Trust badges */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { icon: 'shield-checkmark-outline', label: 'Verified', active: contractor?.verified ?? false,          activeColor: '#22C55E' },
          { icon: 'umbrella-outline',          label: 'Insured',  active: contractor?.insured ?? false,           activeColor: '#38BDF8' },
          { icon: 'document-text-outline',     label: 'Licensed', active: contractor?.license_verified ?? false,  activeColor: '#A78BFA' },
        ].map(t => (
          <View key={t.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, borderWidth: 1, paddingVertical: 8, backgroundColor: t.active ? t.activeColor + '10' : C.background, borderColor: t.active ? t.activeColor + '40' : C.border }}>
            <Ionicons name={t.icon as any} size={13} color={t.active ? t.activeColor : C.textMuted} />
            <Text style={{ fontSize: 10, fontWeight: Font.bold, color: t.active ? t.activeColor : C.textMuted }}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* Specializations */}
      {specs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {specs.slice(0, 5).map((spec: string) => (
            <View key={spec} style={{ borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.background, borderColor: C.border }}>
              <Text style={{ fontSize: 11, fontWeight: Font.semibold, color: C.textSecondary }}>{spec}</Text>
            </View>
          ))}
          {specs.length > 5 && (
            <View style={{ borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.background, borderColor: C.border }}>
              <Text style={{ fontSize: 11, fontWeight: Font.semibold, color: C.textMuted }}>+{specs.length - 5} more</Text>
            </View>
          )}
        </View>
      )}

      {/* View Full Profile */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: C.orange, paddingVertical: 11, backgroundColor: 'rgba(255,98,0,0.06)' }}
        onPress={() => router.push(`/company/${contractor.id}` as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="business-outline" size={15} color={C.orange} />
        <Text style={{ fontSize: 13, fontWeight: Font.black, color: C.orange }}>View Full Profile</Text>
        <Ionicons name="arrow-forward" size={13} color={C.orange} />
      </TouchableOpacity>
    </View>
  );
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: C } = useTheme();
  const { isContractor, isCustomer } = useRole();

  const { user } = useAuth();
  const isAdmin = user?.email === 'joegimapa@gmail.com';

  const [booking, setBooking]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [beforePhotos, setBeforePhotos]       = useState<string[]>([]);
  const [afterPhotos, setAfterPhotos]         = useState<string[]>([]);
  const [showReviewBanner, setShowReviewBanner] = useState(false);
  const [offer,              setOffer]              = useState<any>(null);
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterPrice,       setCounterPrice]       = useState('');
  const [counterNote,        setCounterNote]        = useState('');
  const [offerSaving,        setOfferSaving]        = useState(false);
  const [cancelSaving,       setCancelSaving]       = useState(false);
  const [cancelPolicyOpen,   setCancelPolicyOpen]   = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [showQuoteSheet,     setShowQuoteSheet]     = useState(false);

  useEffect(() => {
    if (!id) return;
    async function loadData() {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`*, contractor:contractor_id (id, company_name, trade_type, avatar_url, rating, phone, tagline, description, username, plan, verification_status, verified, insured, license_verified, specializations, is_available, total_bookings, review_count, location)`)
        .eq('id', id)
        .maybeSingle();
      setBooking(bookingData ?? null);
      setBeforePhotos(bookingData?.before_photos ?? []);
      setAfterPhotos(bookingData?.after_photos ?? []);

      const { data: offerData } = await supabase
        .from('job_offers')
        .select('*, contractor:contractor_id(id, company_name, trade_type, avatar_url, rating, phone, tagline, username, plan, verification_status, verified, insured, specializations, location)')
        .eq('booking_id', id)
        .in('status', ['quoted', 'countered', 'accepted', 'declined'])
        .order('offered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setOffer(offerData ?? null);

      setLoading(false);
    }
    loadData();
  }, [id]);

  // Realtime offer updates
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`job_offer_detail:${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_offers',
        filter: `booking_id=eq.${id}`,
      }, ({ new: updated }) => { setOffer(updated as any); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Show review prompt when customer's job is approved and no review submitted yet
  useEffect(() => {
    if (!id || !isCustomer || !booking) return;
    if (!['approved', 'paid'].includes(booking.status)) return;
    const key = `review_prompted_${id}`;
    AsyncStorage.getItem(key).then(async (val) => {
      if (val) return;
      const { data } = await supabase.from('reviews').select('id').eq('booking_id', id).maybeSingle();
      if (!data) setShowReviewBanner(true);
    }).catch(() => {});
  }, [id, isCustomer, booking?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acceptQuote() {
    if (!offer) return;
    setOfferSaving(true);
    await supabase.from('job_offers').update({ status: 'accepted', customer_action: 'accepted', final_price: offer.quoted_price }).eq('id', offer.id);
    const bookingUpdates: Record<string, any> = {
      status:         'confirmed',
      price_estimate: offer.quoted_price,
      contractor_id:  offer.contractor_id,
    };
    if (offer.scheduled_at) bookingUpdates.scheduled_at = offer.scheduled_at;
    if (offer.booking_time) bookingUpdates.booking_time  = offer.booking_time;
    await supabase.from('bookings').update(bookingUpdates).eq('id', id);

    // Create work order so both parties can access it immediately
    const { data: ctxr } = await supabase
      .from('contractors_public')
      .select('company_name')
      .eq('id', offer.contractor_id)
      .single();
    await supabase.from('work_orders').upsert({
      booking_id:      id as string,
      contractor_id:   offer.contractor_id,
      customer_id:     booking.customer_id,
      service_type:    booking.trade,
      job_address:     booking.job_address || booking.notes || '',
      contractor_name: ctxr?.company_name || '',
      customer_name:   booking.customer_name || '',
      wo_status:       'accepted',
    }, { onConflict: 'booking_id', ignoreDuplicates: true });

    // Seed the chat thread so both parties see it in Messages immediately
    const chatId = deriveChatId(booking.customer_id, offer.contractor_id);
    supabase.from('messages').insert({
      chat_id:      chatId,
      sender_id:    booking.customer_id,
      recipient_id: offer.contractor_id,
      sender_name:  'Tradease',
      body:         `✅ ${booking.trade ?? 'Job'} confirmed — your contractor is ready to begin. Unlimited messaging enabled.`,
      read:         false,
      is_system:    true,
      sender_role:  'system',
    }).then(() => {});

    setOfferSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBooking((p: any) => ({ ...p, status: 'confirmed', price_estimate: offer.quoted_price, contractor_id: offer.contractor_id }));
  }

  function declineQuote() {
    Alert.alert('Decline Quote', "Decline this contractor's quote?", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        await supabase.from('job_offers').update({ status: 'declined', customer_action: 'declined' }).eq('id', offer!.id);
        setOffer((p: any) => ({ ...p, status: 'declined' }));
      }},
    ]);
  }

  async function sendCounter() {
    const numPrice = parseFloat(counterPrice.replace(/[^0-9.]/g, ''));
    const minCounter = Math.ceil((offer?.quoted_price ?? 0) * 0.7);
    if (!numPrice || numPrice < minCounter) {
      Alert.alert('Price too low', `Minimum counter is $${minCounter} (70% of quoted price).`);
      return;
    }
    setOfferSaving(true);
    const counterExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await supabase.from('job_offers').update({
      status:           'countered',
      customer_action:  'countered',
      counter_price:    numPrice,
      counter_note:     counterNote.trim() || null,
      counter_expires_at: counterExpiresAt,
    }).eq('id', offer!.id);
    setOfferSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCounterModalVisible(false);
    setCounterPrice('');
    setCounterNote('');
  }

  async function acceptInstantBook() {
    if (!booking || !user) return;
    setOfferSaving(true);
    const { data: claimed, error } = await supabase.from('bookings').update({
      contractor_id: user.id,
      status: 'confirmed',
    }).eq('id', id).select();
    if (error) { setOfferSaving(false); Alert.alert('Error', 'Could not accept job.'); return; }
    if (!claimed || claimed.length === 0) {
      setOfferSaving(false);
      Alert.alert('Job Unavailable', 'This job was already accepted by another contractor.');
      return;
    }
    const { data: ctxr } = await supabase.from('contractors').select('company_name').eq('id', user.id).single();
    await supabase.from('work_orders').upsert({
      booking_id:      id as string,
      contractor_id:   user.id,
      customer_id:     booking.customer_id,
      service_type:    booking.trade,
      job_address:     booking.job_address || booking.notes || '',
      contractor_name: ctxr?.company_name || '',
      customer_name:   booking.customer_name || '',
      wo_status:       'accepted',
    }, { onConflict: 'booking_id', ignoreDuplicates: true });
    supabase.from('messages').insert({
      chat_id:      deriveChatId(booking.customer_id, user.id),
      sender_id:    booking.customer_id,
      recipient_id: user.id,
      sender_name:  'Tradease',
      body:         `⚡ ${booking.trade ?? 'Job'} booked instantly — your contractor is confirmed and ready to begin.`,
      read:         false,
      is_system:    true,
      sender_role:  'system',
    }).then(() => {});
    setOfferSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBooking((p: any) => ({ ...p, status: 'confirmed', contractor_id: user.id }));
  }

  const CANCELABLE = ['pending', 'accepted', 'confirmed', 'in_progress'];

  // A contractor's quote is only "confirmed" once contractor_id gets set on
  // the booking (happens at quote-acceptance time) — before that, cancelling
  // is free. cancel_booking() enforces this same rule server-side; this is
  // just for the pre-confirmation preview text.
  function getCancelPreview() {
    if (!booking) return { isFree: true, feeAmount: 0 };
    if (booking.contractor_id) return { isFree: false, feeAmount: 30 };
    return { isFree: true, feeAmount: 0 };
  }

  // Admin "Delete" keeps its own direct-update path — cancel_booking() only
  // authorizes the booking's own customer/contractor, not admins.
  async function handleAdminDelete() {
    if (!booking) return;
    Alert.alert('Delete Job', 'Permanently delete this job? This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setCancelSaving(true);
          try {
            const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setBooking((p: any) => ({ ...p, status: 'cancelled' }));
            router.canGoBack() ? router.back() : router.replace('/(tabs)');
          } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not delete job. Try again.');
          } finally {
            setCancelSaving(false);
          }
        },
      },
    ]);
  }

  async function confirmCancel() {
    if (!booking) return;
    setCancelSaving(true);
    try {
      const { data, error } = await supabase.rpc('cancel_booking', {
        p_booking_id: booking.id,
        p_reason: 'customer_cancelled',
      });
      if (error) throw error;

      // Notify assigned contractor when customer cancels
      if (booking.contractor?.id) {
        await supabase.from('notifications').insert({
          user_id: booking.contractor.id,
          type:    'booking_cancelled',
          title:   'Job Cancelled',
          message: `A customer cancelled their ${booking.trade ?? 'job'} booking.`,
          data:    { booking_id: booking.id },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCancelModalVisible(false);
      setBooking((p: any) => ({ ...p, ...data, status: 'cancelled' }));
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
    } catch (err: any) {
      setCancelModalVisible(false);
      Alert.alert('Error', err.message ?? 'Could not cancel job. Try again.');
    } finally {
      setCancelSaving(false);
    }
  }

  // ── Expired-request actions ─────────────────────────────────────────────
  const [expiredActionSaving, setExpiredActionSaving] = useState(false);

  async function postAgain() {
    if (!booking || !user) return;
    setExpiredActionSaving(true);
    try {
      const hours = booking.request_mode === 'post' ? 48 : 24;
      const { data: fresh, error } = await supabase.from('bookings').insert({
        customer_id:         booking.customer_id,
        user_id:             user.id,
        customer_name:       booking.customer_name,
        customer_phone:      booking.customer_phone,
        trade:                booking.trade,
        description:         booking.description,
        notes:               booking.notes,
        job_lat:             booking.job_lat,
        job_lng:             booking.job_lng,
        price_estimate:      booking.price_estimate,
        booking_time:        booking.booking_time,
        status:              'pending',
        payment_status:      'unpaid',
        refund_status:       'none',
        is_instant_book:     booking.is_instant_book,
        instant_book_price:  booking.instant_book_price,
        ...(booking.photo_urls?.length ? { photo_urls: booking.photo_urls } : {}),
        request_mode:        booking.request_mode ?? 'request',
        request_expires_at:  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
      }).select('id').single();
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/job/${fresh!.id}` as any);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not post again. Try again.');
    } finally {
      setExpiredActionSaving(false);
    }
  }

  function editRequest() {
    router.push(`/create-job?editId=${booking.id}` as any);
  }

  function requestCompanyCards() {
    router.push(`/find-contractor?trade=${encodeURIComponent(booking.trade ?? '')}` as any);
  }

  async function deleteExpired() {
    Alert.alert('Delete Request', 'Remove this expired request? This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setExpiredActionSaving(true);
          try {
            const { error } = await supabase.from('bookings').update({ status: 'cancelled', cancel_reason: 'expired_deleted_by_customer' }).eq('id', booking.id);
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.canGoBack() ? router.back() : router.replace('/(tabs)');
          } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not delete. Try again.');
          } finally {
            setExpiredActionSaving(false);
          }
        },
      },
    ]);
  }

  async function saveExpiredAsDraft() {
    setExpiredActionSaving(true);
    try {
      const { error } = await supabase.from('bookings').update({ status: 'draft' }).eq('id', booking.id);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/jobs' as any);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save. Try again.');
    } finally {
      setExpiredActionSaving(false);
    }
  }

  const s = makeStyles(C);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <Text style={[s.notFoundTitle, { color: C.textPrimary }]}>Job not found</Text>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={{ fontSize: 14, color: C.orange, marginTop: 8 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const st = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
  const isActive = ['accepted', 'confirmed', 'in_progress'].includes(booking.status);
  const isCompleted = ['completed', 'approved', 'paid'].includes(booking.status);
  // Derived, not a stored status — see lib/time.ts / the request-window migration comment.
  const isExpired = booking.status === 'pending'
    && !booking.contractor_id
    && !!booking.request_expires_at
    && new Date(booking.request_expires_at) < new Date();
  const chatId = booking.contractor_id && booking.customer_id
    ? deriveChatId(booking.customer_id, booking.contractor_id)
    : null;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.background }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.textPrimary }]}>Job Details</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Trade + Status */}
        <View style={s.tagRow}>
          <View style={[s.tradePill, { backgroundColor: C.orangeDim, borderColor: C.orange }]}>
            <Text style={[s.tradePillText, { color: C.orange }]}>{booking.trade}</Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: (isExpired ? '#EF4444' : st.color) + '20' }]}>
            <Text style={[s.statusPillText, { color: isExpired ? '#EF4444' : st.color }]}>
              {isExpired ? '⏱️  Expired' : `${st.icon}  ${st.label}`}
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={[s.description, { color: C.textPrimary }]}>{booking.description}</Text>

        {/* Info grid */}
        <View style={s.infoGrid}>
          {!!booking.notes && (
            <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="location-outline" size={20} color={C.orange} />
              <Text style={[s.infoLabel, { color: C.textMuted }]}>LOCATION</Text>
              <Text style={[s.infoValue, { color: C.textPrimary }]} numberOfLines={2}>{booking.notes}</Text>
            </View>
          )}
          {!!booking.price_estimate && (
            <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="cash-outline" size={20} color={C.orange} />
              <Text style={[s.infoLabel, { color: C.textMuted }]}>BUDGET</Text>
              <Text style={[s.infoValue, { color: C.textPrimary }]}>${booking.price_estimate}</Text>
            </View>
          )}
          {!!booking.booking_time && (
            <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="time-outline" size={20} color={C.orange} />
              <Text style={[s.infoLabel, { color: C.textMuted }]}>TIMELINE</Text>
              <Text style={[s.infoValue, { color: C.textPrimary }]}>{booking.booking_time}</Text>
            </View>
          )}
          {!!(booking.scheduled_at || offer?.scheduled_at) && (
            <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Ionicons name="calendar-outline" size={20} color={C.orange} />
              <Text style={[s.infoLabel, { color: C.textMuted }]}>PROPOSED DATE</Text>
              <Text style={[s.infoValue, { color: C.textPrimary }]}>
                {new Date(booking.scheduled_at ?? offer!.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
          <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Ionicons name="person-outline" size={20} color={C.orange} />
            <Text style={[s.infoLabel, { color: C.textMuted }]}>CUSTOMER</Text>
            <Text style={[s.infoValue, { color: C.textPrimary }]} numberOfLines={1}>
              {booking.customer_name || 'Customer'}
            </Text>
          </View>
        </View>

        {/* Contractor card — show assigned contractor OR quoting contractor */}
        {(booking.contractor || offer?.contractor) && (
          <>
            <Text style={[s.sectionLabel, { color: C.textSecondary }]}>
              {booking.contractor ? 'ASSIGNED CONTRACTOR' : 'QUOTED BY'}
            </Text>
            <CompanyCard contractor={booking.contractor ?? offer?.contractor} />
          </>
        )}

        {/* Instant Book — contractor claim CTA */}
        {isContractor && !isExpired && booking.status === 'pending' && booking.is_instant_book && !booking.contractor_id && (
          <View style={[s.offerBanner, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }]}>
            <Text style={[s.offerBannerTitle, { color: '#22C55E' }]}>⚡ Instant Book Available</Text>
            <Text style={[s.offerBannerSub, { color: C.textSecondary }]}>
              Customer set a fixed price of{' '}
              <Text style={{ fontWeight: '900', color: '#22C55E' }}>
                ${(booking.instant_book_price ?? booking.price_estimate ?? 0).toLocaleString()}
              </Text>
              {' '}— accept immediately, no quote needed.
            </Text>
            <TouchableOpacity
              style={[s.offerBtn, s.offerBtnAccept, { backgroundColor: '#16A34A', flex: 1, marginTop: 8 }]}
              onPress={acceptInstantBook}
              disabled={offerSaving}
            >
              {offerSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.offerBtnAcceptText}>⚡ Accept Job · ${(booking.instant_book_price ?? booking.price_estimate ?? 0).toLocaleString()}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Finding state — customer view only, no quote active, not instant book */}
        {!isExpired && isCustomer && booking.status === 'pending' && !offer && !booking.is_instant_book && (
          <View style={[s.pendingCard, { backgroundColor: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }]}>
            <ActivityIndicator color="#FBBF24" size="small" />
            <View style={{ flex: 1 }}>
              <Text style={[s.pendingTitle, { color: '#FBBF24' }]}>Finding a contractor...</Text>
              <Text style={[s.pendingSub, { color: C.textSecondary }]}>
                Contractors near you are being notified. You'll receive a notification the moment someone accepts.
              </Text>
              {!!booking.request_expires_at && (
                <Text style={[s.pendingSub, { color: '#FBBF24', marginTop: 4, fontWeight: '700' }]}>
                  {formatRemaining(booking.request_expires_at)}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Same state, contractor view — quoting CTA instead of customer copy */}
        {!isExpired && isContractor && booking.status === 'pending' && !offer && !booking.is_instant_book && (
          <View style={[s.pendingCard, { backgroundColor: 'rgba(255,98,0,0.06)', borderColor: 'rgba(255,98,0,0.2)', flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="pricetag-outline" size={20} color={C.orange} />
              <View style={{ flex: 1 }}>
                <Text style={[s.pendingTitle, { color: C.orange }]}>This job needs a quote</Text>
                <Text style={[s.pendingSub, { color: C.textSecondary }]}>
                  Send a price and timeline to be considered for this job.
                </Text>
                {!!booking.request_expires_at && (
                  <Text style={[s.pendingSub, { color: C.orange, marginTop: 4, fontWeight: '700' }]}>
                    {formatRemaining(booking.request_expires_at)}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={[s.offerBtn, s.offerBtnAccept, { backgroundColor: C.orange }]}
              onPress={() => setShowQuoteSheet(true)}
            >
              <Text style={s.offerBtnAcceptText}>Send a Quote</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Instant Book waiting state — customer view */}
        {!isExpired && isCustomer && booking.status === 'pending' && booking.is_instant_book && !booking.contractor_id && (
          <View style={[s.pendingCard, { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <ActivityIndicator color="#22C55E" size="small" />
            <View style={{ flex: 1 }}>
              <Text style={[s.pendingTitle, { color: '#22C55E' }]}>⚡ Waiting for contractor...</Text>
              <Text style={[s.pendingSub, { color: C.textSecondary }]}>
                Your Instant Book job is live at ${(booking.instant_book_price ?? booking.price_estimate ?? 0).toLocaleString()}. The first contractor to accept will be assigned automatically.
              </Text>
              {!!booking.request_expires_at && (
                <Text style={[s.pendingSub, { color: '#22C55E', marginTop: 4, fontWeight: '700' }]}>
                  {formatRemaining(booking.request_expires_at)}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Expired state — customer view, recovery actions */}
        {isExpired && isCustomer && (
          <View style={[s.pendingCard, { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)', flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="time-outline" size={20} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={[s.pendingTitle, { color: '#EF4444' }]}>Request expired</Text>
                <Text style={[s.pendingSub, { color: C.textSecondary }]}>
                  No contractor claimed this {booking.request_mode === 'post' ? 'post' : 'request'} in time. Your original details are still saved below.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <TouchableOpacity
                style={[s.offerBtn, s.offerBtnAccept, { backgroundColor: C.orange, flexGrow: 1 }]}
                onPress={postAgain}
                disabled={expiredActionSaving}
              >
                {expiredActionSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.offerBtnAcceptText}>Post Again</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, { borderWidth: 1, borderColor: C.border, flexGrow: 1 }]} onPress={editRequest} disabled={expiredActionSaving}>
                <Text style={{ color: C.textPrimary, fontWeight: '700', fontSize: 13 }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, { borderWidth: 1, borderColor: C.border, flexGrow: 1 }]} onPress={requestCompanyCards} disabled={expiredActionSaving}>
                <Text style={{ color: C.textPrimary, fontWeight: '700', fontSize: 13 }}>Request Company Cards</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, { borderWidth: 1, borderColor: C.border, flexGrow: 1 }]} onPress={saveExpiredAsDraft} disabled={expiredActionSaving}>
                <Text style={{ color: C.textPrimary, fontWeight: '700', fontSize: 13 }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, { borderWidth: 1, borderColor: '#EF4444', flexGrow: 1 }]} onPress={deleteExpired} disabled={expiredActionSaving}>
                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quote received — customer action required */}
        {isCustomer && booking.status === 'pending' && offer?.status === 'quoted' && (
          <View style={[s.offerBanner, { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)' }]}>
            <Text style={[s.offerBannerTitle, { color: '#FBBF24' }]}>💰 Quote Received</Text>
            <Text style={[s.offerBannerSub, { color: C.textSecondary }]}>
              A contractor quoted{' '}
              <Text style={{ fontWeight: '900', color: '#FBBF24' }}>${offer.quoted_price?.toLocaleString()}</Text>
              {offer.quote_note ? ` · "${offer.quote_note}"` : ''}
            </Text>
            <Text style={[s.offerBannerWarning, { color: C.textMuted }]}>
              ⚠️ You can accept, decline, or counter once. Countering is final.
            </Text>
            <View style={s.offerBannerActions}>
              <TouchableOpacity style={[s.offerBtn, s.offerBtnDecline]} onPress={declineQuote}>
                <Text style={s.offerBtnDeclineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, s.offerBtnCounter]} onPress={() => setCounterModalVisible(true)}>
                <Text style={s.offerBtnCounterText}>Counter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.offerBtn, s.offerBtnAccept]} onPress={acceptQuote} disabled={offerSaving}>
                {offerSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.offerBtnAcceptText}>Accept ${offer.quoted_price?.toLocaleString()}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Counter sent — waiting for contractor */}
        {isCustomer && booking.status === 'pending' && offer?.status === 'countered' && (
          <View style={[s.offerBanner, { backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)' }]}>
            <Text style={[s.offerBannerTitle, { color: '#38BDF8' }]}>⏳ Counter Sent</Text>
            <Text style={[s.offerBannerSub, { color: C.textSecondary }]}>
              You countered at{' '}
              <Text style={{ fontWeight: '900', color: '#38BDF8' }}>${offer.counter_price?.toLocaleString()}</Text>
              . Waiting for contractor response.
            </Text>
            <Text style={[s.offerBannerWarning, { color: C.textMuted }]}>No further countering allowed.</Text>
          </View>
        )}

        {/* Job Photos */}
        {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
          <>
            <Text style={[s.sectionLabel, { color: C.textSecondary }]}>JOB PHOTOS</Text>
            {beforePhotos.length > 0 && (
              <>
                <Text style={[s.infoLabel, { color: C.textMuted, marginBottom: 6 }]}>BEFORE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {beforePhotos.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={{ width: CARD_W, height: CARD_W, borderRadius: 10 }} />
                  ))}
                </View>
              </>
            )}
            {afterPhotos.length > 0 && (
              <>
                <Text style={[s.infoLabel, { color: C.textMuted, marginBottom: 6, marginTop: beforePhotos.length > 0 ? 12 : 0 }]}>AFTER</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {afterPhotos.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={{ width: CARD_W, height: CARD_W, borderRadius: 10 }} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Escrow held notice — for active/in-progress */}
        {(booking.status === 'in_progress' || booking.status === 'accepted') && (
          <View style={[s.noticeCard, { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#22C55E" />
            <View style={{ flex: 1 }}>
              <Text style={[s.noticeTitle, { color: '#22C55E' }]}>Payment held in escrow</Text>
              <Text style={[s.noticeSub, { color: C.textSecondary }]}>
                Funds are only released when you approve the completed work.
              </Text>
            </View>
          </View>
        )}

        {/* Cancellation policy */}
        {!['cancelled', 'completed', 'paid', 'approved'].includes(booking.status) && (
          <TouchableOpacity
            style={[s.noticeCard, { backgroundColor: 'rgba(251,191,36,0.04)', borderColor: 'rgba(251,191,36,0.15)' }]}
            onPress={() => setCancelPolicyOpen(p => !p)}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={18} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={[s.noticeTitle, { color: '#FBBF24' }]}>
                Cancellation Policy  {cancelPolicyOpen ? '▲' : '▼'}
              </Text>
              {cancelPolicyOpen ? (
                <View style={{ marginTop: 6, gap: 5 }}>
                  {[
                    'Before you confirm a contractor\'s quote → Free',
                    'After you confirm a contractor\'s quote → $30 fee, paid to the contractor',
                  ].map((line, i) => (
                    <Text key={i} style={[s.noticeSub, { color: C.textSecondary }]}>· {line}</Text>
                  ))}
                </View>
              ) : (
                <Text style={[s.noticeSub, { color: C.textMuted }]}>Tap to view cancellation rules</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Review prompt */}
        {showReviewBanner && booking.contractor && (
          <TouchableOpacity
            style={[s.reviewBanner, { backgroundColor: 'rgba(245,166,35,0.08)', borderColor: 'rgba(245,166,35,0.25)' }]}
            onPress={() => router.push(`/work-order/customer?booking_id=${id}` as any)}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 22 }}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.reviewBannerTitle, { color: '#F5A623' }]}>
                How did {booking.contractor.company_name} do?
              </Text>
              <Text style={[s.reviewBannerSub, { color: C.textSecondary }]}>Leave a review — takes 30 seconds</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#F5A623" />
          </TouchableOpacity>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Send-quote sheet — same component the contractor feed uses */}
      <QuoteBottomSheet
        booking={booking}
        contractorId={user?.id ?? ''}
        visible={showQuoteSheet}
        onClose={() => setShowQuoteSheet(false)}
        onSent={() => {
          setShowQuoteSheet(false);
          Alert.alert('Quote Sent', 'The customer has been notified.');
        }}
      />

      {/* Counter offer modal */}
      <Modal visible={counterModalVisible} transparent animationType="slide" onRequestClose={() => setCounterModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.modalBackdrop} onPress={() => setCounterModalVisible(false)} activeOpacity={1} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Make a Counter Offer</Text>
            <Text style={[s.modalSub, { color: C.textSecondary }]}>
              Min. ${Math.ceil((offer?.quoted_price ?? 0) * 0.7).toLocaleString()} · 70% of ${offer?.quoted_price?.toLocaleString() ?? '0'}
            </Text>
            <Text style={s.modalWarning}>⚠️ This is your only counter — no further negotiation after this.</Text>

            <Text style={s.modalLabel}>YOUR COUNTER</Text>
            <View style={s.modalPriceRow}>
              <Text style={s.modalDollar}>$</Text>
              <TextInput
                style={s.modalPriceInput}
                value={counterPrice}
                onChangeText={setCounterPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#5A5A70"
                autoFocus
              />
            </View>

            <Text style={s.modalLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={s.modalNoteInput}
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder="Explain your counter..."
              placeholderTextColor="#5A5A70"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[s.modalSendBtn, offerSaving && { opacity: 0.5 }]}
              onPress={sendCounter}
              disabled={offerSaving}
              activeOpacity={0.8}
            >
              {offerSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.modalSendBtnText}>Send Counter</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel confirmation modal */}
      <Modal visible={cancelModalVisible} transparent animationType="slide" onRequestClose={() => setCancelModalVisible(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} onPress={() => setCancelModalVisible(false)} activeOpacity={1} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Cancel this job?</Text>
            {getCancelPreview().isFree ? (
              <Text style={[s.modalSub, { color: C.textSecondary }]}>
                No cancellation fee applies — you haven't confirmed a contractor's quote yet.
              </Text>
            ) : (
              <Text style={[s.modalSub, { color: '#F59E0B' }]}>
                A $30 cancellation fee will apply, paid to your contractor. It's recorded now and billed once payments are live.
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2A2A38', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelSaving}
              >
                <Text style={{ fontSize: 15, fontWeight: Font.bold, color: '#F0F0F5' }}>Keep Job</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', opacity: cancelSaving ? 0.6 : 1 }}
                onPress={confirmCancel}
                disabled={cancelSaving}
              >
                {cancelSaving
                  ? <ActivityIndicator color="#EF4444" />
                  : <Text style={{ fontSize: 15, fontWeight: Font.black, color: '#EF4444' }}>Cancel Job</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fixed bottom CTAs */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.background }}>
        <View style={[s.ctaBar, { borderTopColor: C.border }]}>

          {/* Customer: Open Chat when active */}
          {isCustomer && isActive && chatId && (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: C.orange, flex: 1 }]}
              onPress={() => router.push(`/chat/${chatId}` as any)}
            >
              <Ionicons name="chatbubble-outline" size={18} color={C.background} />
              <Text style={[s.ctaBtnText, { color: C.background }]}>Open Chat</Text>
            </TouchableOpacity>
          )}

          {/* Customer: View Invoice when confirmed, in_progress, or completed */}
          {isCustomer && (['confirmed', 'in_progress'].includes(booking.status) || isCompleted) && (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flex: 1 }]}
              onPress={() => router.push(`/work-order/customer?booking_id=${id}` as any)}
            >
              <Ionicons name="receipt-outline" size={18} color={C.textPrimary} />
              <Text style={[s.ctaBtnText, { color: C.textPrimary }]}>View Work Order</Text>
            </TouchableOpacity>
          )}

          {/* Contractor: Open Chat */}
          {isContractor && isActive && chatId && (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flex: 1 }]}
              onPress={() => router.push(`/chat/${chatId}` as any)}
            >
              <Ionicons name="chatbubble-outline" size={18} color={C.textPrimary} />
              <Text style={[s.ctaBtnText, { color: C.textPrimary }]}>Open Chat</Text>
            </TouchableOpacity>
          )}

          {/* Contractor: Manage Work Order */}
          {isContractor && (isActive || isCompleted) && (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: C.orange, flex: 1 }]}
              onPress={() => router.push(`/work-order/contractor?booking_id=${id}` as any)}
            >
              <Ionicons name="construct-outline" size={18} color={C.background} />
              <Text style={[s.ctaBtnText, { color: C.background }]}>Work Order</Text>
            </TouchableOpacity>
          )}

          {/* Customer cancel — Delete in the Expired card covers this once expired */}
          {isCustomer && !isAdmin && !isExpired && CANCELABLE.includes(booking.status) && (
            <TouchableOpacity
              style={[s.ctaBtn, s.ctaBtnCancel, cancelSaving && { opacity: 0.5 }]}
              onPress={() => setCancelModalVisible(true)}
              disabled={cancelSaving}
            >
              {cancelSaving
                ? <ActivityIndicator color="#EF4444" size="small" />
                : <><Ionicons name="close-circle-outline" size={18} color="#EF4444" /><Text style={[s.ctaBtnText, { color: '#EF4444' }]}>Cancel</Text></>
              }
            </TouchableOpacity>
          )}

          {/* Admin delete */}
          {isAdmin && booking.status !== 'cancelled' && booking.status !== 'completed' && (
            <TouchableOpacity
              style={[s.ctaBtn, s.ctaBtnCancel, cancelSaving && { opacity: 0.5 }]}
              onPress={handleAdminDelete}
              disabled={cancelSaving}
            >
              {cancelSaving
                ? <ActivityIndicator color="#EF4444" size="small" />
                : <><Ionicons name="trash-outline" size={18} color="#EF4444" /><Text style={[s.ctaBtnText, { color: '#EF4444' }]}>Delete</Text></>
              }
            </TouchableOpacity>
          )}

        </View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:          { flex: 1, backgroundColor: C.background },
    center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notFoundTitle:      { fontSize: 18, fontWeight: Font.bold },

    header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border },
    backBtn:            { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    headerTitle:        { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: Font.bold },

    scroll:             { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md },

    tagRow:             { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    tradePill:          { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
    tradePillText:      { fontSize: 12, fontWeight: Font.bold },
    statusPill:         { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
    statusPillText:     { fontSize: 12, fontWeight: Font.bold },

    description:        { fontSize: 15, lineHeight: 24 },

    infoGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    infoCard:           { width: CARD_W, borderRadius: Radius.md, borderWidth: 0.5, padding: Spacing.md, gap: 4 },
    infoLabel:          { fontSize: 9, fontWeight: Font.black, letterSpacing: 1.2 },
    infoValue:          { fontSize: 13, fontWeight: Font.bold, lineHeight: 18 },

    sectionLabel:       { fontSize: 11, fontWeight: Font.black, letterSpacing: 1.5 },

    pendingCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
    pendingTitle:       { fontSize: 14, fontWeight: Font.bold, marginBottom: 4 },
    pendingSub:         { fontSize: 12, lineHeight: 18 },

    noticeCard:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
    noticeTitle:        { fontSize: 13, fontWeight: Font.bold, marginBottom: 2 },
    noticeSub:          { fontSize: 12, lineHeight: 17 },

    ctaBar:             { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderTopWidth: 0.5 },
    ctaBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, paddingVertical: 14 },
    ctaBtnText:         { fontSize: 14, fontWeight: Font.black },
    ctaBtnCancel:       { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', paddingHorizontal: 18 },

    reviewBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
    reviewBannerTitle: { fontSize: 14, fontWeight: Font.bold, marginBottom: 2 },
    reviewBannerSub:   { fontSize: 12 },

    offerBanner:          { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8 },
    offerBannerTitle:     { fontSize: 16, fontWeight: Font.black },
    offerBannerSub:       { fontSize: 13, lineHeight: 19 },
    offerBannerWarning:   { fontSize: 12 },
    offerBannerActions:   { flexDirection: 'row', gap: 8, marginTop: 4 },
    offerBtn:             { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
    offerBtnDecline:      { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
    offerBtnDeclineText:  { fontSize: 13, fontWeight: Font.semibold, color: '#666' },
    offerBtnCounter:      { backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)' },
    offerBtnCounterText:  { fontSize: 13, fontWeight: Font.bold, color: '#38BDF8' },
    offerBtnAccept:       { backgroundColor: '#22C55E' },
    offerBtnAcceptText:   { fontSize: 13, fontWeight: Font.bold, color: '#fff' },

    modalOverlay:     { flex: 1, justifyContent: 'flex-end' as const },
    modalBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
    modalSheet:       { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 44, gap: 10, borderWidth: 0.5, borderColor: '#2A2A38', borderBottomWidth: 0 },
    modalHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#2A2A38', alignSelf: 'center' as const, marginBottom: 6 },
    modalTitle:       { fontSize: 19, fontWeight: Font.black, color: '#F0F0F5' },
    modalSub:         { fontSize: 13, lineHeight: 18 },
    modalWarning:     { fontSize: 12, color: '#F59E0B', fontWeight: Font.semibold },
    modalLabel:       { fontSize: 10, fontWeight: Font.black, color: '#5A5A70', letterSpacing: 0.9, marginTop: 6 },
    modalPriceRow:    { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: '#1C1C26', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A38', paddingHorizontal: 16, height: 64 },
    modalDollar:      { fontSize: 22, fontWeight: Font.black, color: '#9090A8', marginRight: 4 },
    modalPriceInput:  { flex: 1, fontSize: 30, fontWeight: Font.black, color: '#F0F0F5', paddingVertical: 0 },
    modalNoteInput:   { backgroundColor: '#1C1C26', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A38', padding: 14, fontSize: 13, color: '#F0F0F5', lineHeight: 19, textAlignVertical: 'top' as const, minHeight: 80 },
    modalSendBtn:     { backgroundColor: '#38BDF8', borderRadius: 14, paddingVertical: 15, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 4 },
    modalSendBtnText: { fontSize: 16, fontWeight: Font.black, color: '#fff' },
  });
}
