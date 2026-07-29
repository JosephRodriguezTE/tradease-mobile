import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0A0F', surface: '#13131A', surfaceAlt: '#1C1C26', border: '#2A2A38',
  primary: '#F5A623', primaryMuted: 'rgba(245,166,35,0.12)',
  success: '#22C55E', successMuted: 'rgba(34,197,94,0.12)',
  warning: '#FBBF24', warningMuted: 'rgba(251,191,36,0.12)',
  error: '#EF4444', errorMuted: 'rgba(239,68,68,0.12)',
  textPrimary: '#F0F0F5', textSecondary: '#9090A8', textTertiary: '#5A5A70',
};
const SP = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
const R  = { sm: 6, md: 10, lg: 16, xl: 22, full: 9999 } as const;
const TY = { xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, '2xl': 30 } as const;

const TRADE_EMOJI: Record<string, string> = {
  Plumbing: '🔧', Electrical: '⚡', HVAC: '❄️', Carpentry: '🪚',
  Roofing: '🏠', Painting: '🎨', Landscaping: '🌿', Handyman: '🔨',
  Mechanical: '⚙️', Cleaning: '🧹', 'General Contracting': '🏗️',
};

// ─── Timer hook ───────────────────────────────────────────────────────────────
function useTimer(expiresAt: string | null | undefined) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!expiresAt) { setMs(0); return; }
    const tick = () => setMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const expired = !!expiresAt && ms === 0;
  const urgent  = ms > 0 && ms < 60 * 60 * 1000;
  const warning = ms > 0 && ms < 2 * 60 * 60 * 1000;
  const label = expired ? 'Expired' :
    !expiresAt ? '' :
    h > 0  ? `${h}h ${m}m remaining` :
    m > 0  ? `${m}m ${sec}s remaining` :
    `${sec}s remaining`;
  return { expired, urgent, warning, label };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={hdr.row}>
      <TouchableOpacity style={hdr.back} onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
      </TouchableOpacity>
      <Text style={hdr.title}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}
const hdr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border },
  back:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: TY.md, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.3 },
});

function BookingCtx({ booking }: { booking: any }) {
  const emoji = TRADE_EMOJI[booking.trade] ?? '🔧';
  return (
    <View style={[ctx.card, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
      <Text style={ctx.emoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={ctx.trade}>{booking.trade}</Text>
        {!!booking.description && (
          <Text style={ctx.desc} numberOfLines={2}>{booking.description}</Text>
        )}
        {!!booking.users?.full_name && (
          <Text style={ctx.sub}>👤 {booking.users.full_name}</Text>
        )}
      </View>
    </View>
  );
}
const ctx = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'flex-start', gap: SP[3], padding: SP[4], borderRadius: R.lg, borderWidth: 0.5, marginBottom: SP[5] },
  emoji: { fontSize: 24, marginTop: 2 },
  trade: { fontSize: TY.sm, fontWeight: '800', color: C.primary, marginBottom: 2 },
  desc:  { fontSize: TY.sm, lineHeight: 18, color: C.textSecondary, marginBottom: 3 },
  sub:   { fontSize: TY.xs, color: C.textTertiary },
});

function Banner({ icon, color, bg, text }: { icon: string; color: string; bg: string; text: string }) {
  return (
    <View style={[bn.row, { backgroundColor: bg, borderColor: color + '50' }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[bn.text, { color }]}>{text}</Text>
    </View>
  );
}
const bn = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: SP[2], borderRadius: R.md, borderWidth: 1, paddingHorizontal: SP[3], paddingVertical: SP[3], marginBottom: SP[4] },
  text: { fontSize: TY.sm, fontWeight: '600', flex: 1 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ContractorOfferScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [offer,   setOffer]   = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [price,   setPrice]   = useState('');
  const [note,    setNote]    = useState('');

  const timerTarget =
    offer?.status === 'quoted'    ? offer?.expires_at :
    offer?.status === 'countered' ? offer?.counter_expires_at :
    null;
  const timer = useTimer(timerTarget);

  const load = useCallback(async () => {
    const [{ data: b }, { data: o }] = await Promise.all([
      supabase.from('bookings')
        .select('id, trade, description, customer_id, users:customer_id(full_name)')
        .eq('id', bookingId).single(),
      supabase.from('job_offers').select('*').eq('booking_id', bookingId).maybeSingle(),
    ]);
    setBooking(b);
    setOffer(o);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!bookingId) return;
    const ch = supabase.channel(`contractor_offer:${bookingId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_offers',
        filter: `booking_id=eq.${bookingId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bookingId, load]);

  async function sendQuote() {
    const p = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!p || p <= 0) { Alert.alert('Enter a valid price.'); return; }
    setSaving(true);
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('job_offers').upsert({
      booking_id:       bookingId,
      contractor_id:    user?.id,
      customer_id:      booking?.customer_id,
      quoted_price:     p,
      quote_note:       note.trim() || null,
      status:           'quoted',
      customer_action:  'pending',
      contractor_final: 'pending',
      expires_at:       expiresAt,
    }, { onConflict: 'booking_id' });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPrice(''); setNote('');
    load();
  }

  async function acceptCounter() {
    setSaving(true);
    const [{ error: e1 }] = await Promise.all([
      supabase.from('job_offers').update({
        contractor_final: 'accepted',
        status:           'accepted',
        final_price:      offer.counter_price,
      }).eq('id', offer.id),
      supabase.from('bookings').update({
        status:         'confirmed',
        price_estimate: offer.counter_price,
      }).eq('id', bookingId),
    ]);
    setSaving(false);
    if (e1) { Alert.alert('Error', e1.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }

  async function declineCounter() {
    Alert.alert(
      'Decline Counter?',
      "The job will be cancelled and the customer will be notified.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            await supabase.from('job_offers').update({
              contractor_final: 'declined',
              status:           'declined',
            }).eq('id', offer.id);
            setSaving(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            load();
          },
        },
      ],
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Send Quote" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  const pct = offer?.counter_price && offer?.quoted_price
    ? Math.round((offer.counter_price / offer.quoted_price) * 100)
    : null;

  // ── Quote form ───────────────────────────────────────────────────────────────
  if (!offer || offer.status === 'expired') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Send Quote" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {booking && <BookingCtx booking={booking} />}

            {offer?.status === 'expired' && (
              <Banner icon="time-outline" color={C.error} bg={C.errorMuted}
                text="Your previous quote expired. Send a new one." />
            )}

            <Text style={s.label}>YOUR PRICE</Text>
            <View style={[s.priceRow, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[s.dollar, { color: C.textSecondary }]}>$</Text>
              <TextInput
                style={[s.priceInput, { color: C.textPrimary }]}
                placeholder="0"
                placeholderTextColor={C.textTertiary}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />
            </View>

            <Text style={s.label}>MESSAGE (OPTIONAL)</Text>
            <TextInput
              style={[s.noteInput, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
              placeholder="Describe the scope, materials, or timeline..."
              placeholderTextColor={C.textTertiary}
              multiline
              value={note}
              onChangeText={setNote}
            />

            <View style={[s.infoBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <Ionicons name="information-circle-outline" size={15} color={C.textTertiary} />
              <Text style={[s.infoText, { color: C.textTertiary }]}>
                Quote expires in 4 hours · Customer may counter once · You then accept or decline
              </Text>
            </View>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={sendQuote}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="send" size={16} color="#fff" /><Text style={s.btnText}>Send Quote</Text></>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Quoted: waiting for customer ─────────────────────────────────────────────
  if (offer.status === 'quoted') {
    const tc = timer.urgent ? C.error : timer.warning ? C.warning : C.textTertiary;
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Quote Sent" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <ScrollView contentContainerStyle={s.scroll}>
          {booking && <BookingCtx booking={booking} />}
          <Banner icon="checkmark-circle" color={C.success} bg={C.successMuted}
            text="Quote sent — awaiting customer response" />
          <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.cardTag, { color: C.textTertiary }]}>YOUR QUOTE</Text>
            <Text style={[s.bigPrice, { color: C.textPrimary }]}>
              ${offer.quoted_price?.toLocaleString('en-US')}
            </Text>
            {!!offer.quote_note && (
              <Text style={[s.cardNote, { color: C.textSecondary }]}>{offer.quote_note}</Text>
            )}
            <View style={[s.timerRow, { borderTopColor: C.border }]}>
              <Ionicons name="time-outline" size={14} color={tc} />
              <Text style={[s.timerText, { color: tc }]}>{timer.label}</Text>
            </View>
          </View>
          <Text style={[s.hint, { color: C.textTertiary }]}>
            You'll be notified immediately if the customer counters. The quote expires if they don't respond in time.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Countered: contractor decides ────────────────────────────────────────────
  if (offer.status === 'countered') {
    const tc = timer.urgent ? C.error : timer.warning ? C.warning : C.textTertiary;
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Counter Received" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <ScrollView contentContainerStyle={s.scroll}>
          {booking && <BookingCtx booking={booking} />}
          <Banner icon="swap-horizontal" color={C.warning} bg={C.warningMuted}
            text="Customer sent a counter offer" />

          <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            {/* Price breakdown */}
            <View style={s.splitRow}>
              <View style={s.splitCol}>
                <Text style={[s.splitTag, { color: C.textTertiary }]}>YOUR QUOTE</Text>
                <Text style={[s.splitPrice, { color: C.textSecondary }]}>
                  ${offer.quoted_price?.toLocaleString('en-US')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={C.textTertiary} />
              <View style={[s.splitCol, { alignItems: 'flex-end' }]}>
                <Text style={[s.splitTag, { color: C.textTertiary }]}>COUNTER</Text>
                <Text style={[s.splitPrice, { color: C.warning }]}>
                  ${offer.counter_price?.toLocaleString('en-US')}
                </Text>
              </View>
            </View>

            {pct !== null && (
              <View style={[s.pctChip, { backgroundColor: C.warningMuted }]}>
                <Text style={[s.pctText, { color: C.warning }]}>{pct}% of your quote</Text>
              </View>
            )}

            {!!offer.counter_note && (
              <View style={[s.noteBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <Ionicons name="chatbubble-outline" size={13} color={C.textTertiary} />
                <Text style={[s.noteBoxText, { color: C.textSecondary }]}>{offer.counter_note}</Text>
              </View>
            )}

            <View style={[s.timerRow, { borderTopColor: C.border }]}>
              <Ionicons name="time-outline" size={14} color={tc} />
              <Text style={[s.timerText, { color: tc }]}>{timer.label}</Text>
            </View>
          </View>

          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.declineBtn, { borderColor: C.error, opacity: saving ? 0.5 : 1 }]}
              onPress={declineCounter}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={[s.declineBtnText, { color: C.error }]}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.acceptBtn, { backgroundColor: C.success, opacity: saving ? 0.5 : 1 }]}
              onPress={acceptCounter}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={s.acceptBtnText}>
                      Accept ${offer.counter_price?.toLocaleString('en-US')}
                    </Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Accepted ─────────────────────────────────────────────────────────────────
  if (offer.status === 'accepted') {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Deal Closed" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <View style={s.center}>
          <View style={[s.resultCard, { backgroundColor: C.surface, borderColor: C.success + '60' }]}>
            <View style={[s.resultIcon, { backgroundColor: C.successMuted }]}>
              <Ionicons name="checkmark-circle" size={40} color={C.success} />
            </View>
            <Text style={[s.resultTitle, { color: C.textPrimary }]}>Deal Closed</Text>
            <Text style={[s.resultPrice, { color: C.success }]}>
              ${offer.final_price?.toLocaleString('en-US')}
            </Text>
            <Text style={[s.resultSub, { color: C.textSecondary }]}>Agreed price</Text>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.primary, marginTop: SP[4] }]}
              onPress={() => router.replace(`/work-order/contractor?id=${bookingId}` as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={16} color="#fff" />
              <Text style={s.btnText}>Go to Work Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Declined / other ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <Header title="Offer Ended" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <View style={s.center}>
        <View style={[s.resultCard, { backgroundColor: C.surface, borderColor: C.error + '60' }]}>
          <View style={[s.resultIcon, { backgroundColor: C.errorMuted }]}>
            <Ionicons name="close-circle" size={40} color={C.error} />
          </View>
          <Text style={[s.resultTitle, { color: C.textPrimary }]}>Offer Declined</Text>
          <Text style={[s.resultSub, { color: C.textSecondary }]}>
            The negotiation has ended. You can discuss the job directly with the customer.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SP[5] },
  scroll: { padding: SP[4], paddingBottom: SP[10] },

  label:     { fontSize: TY.xs, fontWeight: '800', letterSpacing: 0.8, color: C.textTertiary, marginBottom: SP[2], marginTop: SP[2] },
  priceRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: R.lg, borderWidth: 1, paddingHorizontal: SP[4], marginBottom: SP[4], height: 68 },
  dollar:    { fontSize: TY.xl, fontWeight: '800', marginRight: SP[1] },
  priceInput:{ flex: 1, fontSize: TY['2xl'], fontWeight: '900', paddingVertical: 0 },
  noteInput: { borderRadius: R.lg, borderWidth: 1, padding: SP[4], minHeight: 88, fontSize: TY.sm, lineHeight: 20, textAlignVertical: 'top', marginBottom: SP[4] },
  infoBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: SP[2], padding: SP[3], borderRadius: R.md, borderWidth: 0.5, marginBottom: SP[5] },
  infoText:  { fontSize: TY.xs, flex: 1, lineHeight: 17 },

  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: R.lg, paddingVertical: SP[4] },
  btnText: { fontSize: TY.base, fontWeight: '800', color: '#fff' },

  card:      { borderRadius: R.xl, borderWidth: 0.5, padding: SP[5], marginBottom: SP[4], gap: SP[3] },
  cardTag:   { fontSize: TY.xs, fontWeight: '800', letterSpacing: 0.8 },
  bigPrice:  { fontSize: TY['2xl'], fontWeight: '900' },
  cardNote:  { fontSize: TY.sm, lineHeight: 20 },
  timerRow:  { flexDirection: 'row', alignItems: 'center', gap: SP[2], paddingTop: SP[3], borderTopWidth: 0.5 },
  timerText: { fontSize: TY.sm, fontWeight: '700' },
  hint:      { fontSize: TY.xs, lineHeight: 18, textAlign: 'center', paddingHorizontal: SP[2], marginTop: SP[2] },

  splitRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP[2] },
  splitCol:  { alignItems: 'flex-start', gap: 4 },
  splitTag:  { fontSize: TY.xs, fontWeight: '700', letterSpacing: 0.5 },
  splitPrice:{ fontSize: TY.xl, fontWeight: '900' },
  pctChip:   { alignSelf: 'flex-start', borderRadius: R.full, paddingHorizontal: SP[3], paddingVertical: SP[1] },
  pctText:   { fontSize: TY.xs, fontWeight: '700' },
  noteBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: SP[2], padding: SP[3], borderRadius: R.md, borderWidth: 0.5 },
  noteBoxText:{ fontSize: TY.sm, lineHeight: 18, flex: 1 },

  actionRow:     { flexDirection: 'row', gap: SP[3], marginTop: SP[2] },
  declineBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1.5, paddingVertical: SP[4] },
  declineBtnText:{ fontSize: TY.base, fontWeight: '800' },
  acceptBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: R.lg, paddingVertical: SP[4] },
  acceptBtnText: { fontSize: TY.base, fontWeight: '800', color: '#fff' },

  resultCard:  { width: '100%', borderRadius: R.xl, borderWidth: 1, padding: SP[6], alignItems: 'center', gap: SP[3] },
  resultIcon:  { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: TY.lg, fontWeight: '900', letterSpacing: -0.3 },
  resultPrice: { fontSize: TY['2xl'], fontWeight: '900' },
  resultSub:   { fontSize: TY.sm, textAlign: 'center', lineHeight: 20 },
});
