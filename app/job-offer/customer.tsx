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
export default function CustomerOfferScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [offer,        setOffer]        = useState<any>(null);
  const [booking,      setBooking]      = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [showCounter,  setShowCounter]  = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [counterNote,  setCounterNote]  = useState('');

  const timerTarget =
    offer?.status === 'quoted'    ? offer?.expires_at :
    offer?.status === 'countered' ? offer?.counter_expires_at :
    null;
  const timer = useTimer(timerTarget);

  const minCounter = offer?.quoted_price ? Math.ceil(offer.quoted_price * 0.7) : 0;

  const load = useCallback(async () => {
    const [{ data: b }, { data: o }] = await Promise.all([
      supabase.from('bookings')
        .select('id, trade, description, contractor_id, contractors:contractor_id(company_name)')
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
    const ch = supabase.channel(`customer_offer:${bookingId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'job_offers',
        filter: `booking_id=eq.${bookingId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bookingId, load]);

  async function acceptQuote() {
    setSaving(true);
    const [{ error: e1 }] = await Promise.all([
      supabase.from('job_offers').update({
        customer_action: 'accepted',
        status:          'accepted',
        final_price:     offer.quoted_price,
      }).eq('id', offer.id),
      supabase.from('bookings').update({
        status:         'confirmed',
        price_estimate: offer.quoted_price,
      }).eq('id', bookingId),
    ]);
    setSaving(false);
    if (e1) { Alert.alert('Error', e1.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }

  async function declineQuote() {
    Alert.alert(
      'Decline Quote?',
      'The job will be cancelled.',
      [
        { text: 'Keep Looking', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            await supabase.from('job_offers').update({
              customer_action: 'declined',
              status:          'declined',
            }).eq('id', offer.id);
            setSaving(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            load();
          },
        },
      ],
    );
  }

  async function sendCounter() {
    const p = parseFloat(counterPrice.replace(/[^0-9.]/g, ''));
    if (!p || p <= 0) { Alert.alert('Enter a valid price.'); return; }
    if (p < minCounter) {
      Alert.alert(
        'Price Too Low',
        `Minimum counter is $${minCounter.toLocaleString('en-US')} — 70% of the quoted price.`,
      );
      return;
    }
    setSaving(true);
    const counterExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('job_offers').update({
      customer_action:    'countered',
      counter_price:      p,
      counter_note:       counterNote.trim() || null,
      status:             'countered',
      counter_expires_at: counterExpiresAt,
    }).eq('id', offer.id);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCounter(false);
    setCounterPrice('');
    setCounterNote('');
    load();
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Quote" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  // ── No quote yet ─────────────────────────────────────────────────────────────
  if (!offer || offer.status === 'pending') {
    const emoji = TRADE_EMOJI[booking?.trade] ?? '🔧';
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Awaiting Quote" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <View style={s.center}>
          <View style={[s.waitCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={s.waitEmoji}>{emoji}</Text>
            <ActivityIndicator color={C.primary} style={{ marginBottom: SP[3] }} />
            <Text style={[s.waitTitle, { color: C.textPrimary }]}>Waiting for Quote</Text>
            <Text style={[s.waitSub, { color: C.textSecondary }]}>
              The contractor is preparing a price. You'll get a notification the moment it arrives.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Quote received ────────────────────────────────────────────────────────────
  if (offer.status === 'quoted') {
    const tc = timer.urgent ? C.error : timer.warning ? C.warning : C.textTertiary;
    const contractorName = booking?.contractors?.company_name ?? 'Contractor';

    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Quote Received" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Quote card */}
            <View style={[s.quoteCard, { backgroundColor: C.surface, borderColor: C.primary + '40' }]}>
              <View style={s.quoteHeader}>
                <View>
                  <Text style={[s.fromLabel, { color: C.textTertiary }]}>QUOTE FROM</Text>
                  <Text style={[s.fromName, { color: C.textPrimary }]}>{contractorName}</Text>
                </View>
                <View style={[s.newBadge, { backgroundColor: C.primaryMuted }]}>
                  <Ionicons name="pricetag" size={11} color={C.primary} />
                  <Text style={[s.newBadgeText, { color: C.primary }]}>New</Text>
                </View>
              </View>

              <Text style={[s.bigPrice, { color: C.textPrimary }]}>
                ${offer.quoted_price?.toLocaleString('en-US')}
              </Text>

              {!!offer.quote_note && (
                <View style={[s.noteBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <Ionicons name="chatbubble-outline" size={13} color={C.textTertiary} />
                  <Text style={[s.noteBoxText, { color: C.textSecondary }]}>{offer.quote_note}</Text>
                </View>
              )}

              <View style={[s.timerRow, { borderTopColor: C.border }]}>
                <Ionicons name="time-outline" size={14} color={tc} />
                <Text style={[s.timerText, { color: tc }]}>{timer.label}</Text>
              </View>
            </View>

            {/* Action buttons or counter form */}
            {!showCounter ? (
              <View style={s.actionStack}>
                <TouchableOpacity
                  style={[s.acceptBtn, { backgroundColor: C.success, opacity: saving ? 0.6 : 1 }]}
                  onPress={acceptQuote}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={s.acceptBtnText}>
                          Accept ${offer.quoted_price?.toLocaleString('en-US')}
                        </Text>
                      </>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.counterBtn, { borderColor: C.warning, backgroundColor: C.warningMuted }]}
                  onPress={() => setShowCounter(true)}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="swap-horizontal" size={16} color={C.warning} />
                  <Text style={[s.counterBtnText, { color: C.warning }]}>Counter Offer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.declineBtn, { borderColor: C.error, opacity: saving ? 0.6 : 1 }]}
                  onPress={declineQuote}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={[s.declineBtnText, { color: C.error }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Counter form */
              <View style={[s.counterForm, { backgroundColor: C.surface, borderColor: C.warning + '50' }]}>
                <View style={s.counterFormHeader}>
                  <Text style={[s.counterFormTitle, { color: C.textPrimary }]}>Your Counter</Text>
                  <TouchableOpacity
                    onPress={() => { setShowCounter(false); setCounterPrice(''); setCounterNote(''); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={20} color={C.textTertiary} />
                  </TouchableOpacity>
                </View>

                <Text style={[s.minLabel, { color: C.textTertiary }]}>
                  Minimum: ${minCounter.toLocaleString('en-US')} (70% of ${offer.quoted_price?.toLocaleString('en-US')})
                </Text>

                <View style={[s.priceRow, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <Text style={[s.dollar, { color: C.textSecondary }]}>$</Text>
                  <TextInput
                    style={[s.priceInput, { color: C.textPrimary }]}
                    placeholder={String(minCounter)}
                    placeholderTextColor={C.textTertiary}
                    keyboardType="decimal-pad"
                    value={counterPrice}
                    onChangeText={setCounterPrice}
                    autoFocus
                  />
                </View>

                <TextInput
                  style={[s.noteInput, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary }]}
                  placeholder="Explain your counter (optional)..."
                  placeholderTextColor={C.textTertiary}
                  multiline
                  value={counterNote}
                  onChangeText={setCounterNote}
                />

                <View style={[s.warnBox, { backgroundColor: C.warningMuted, borderColor: C.warning + '40' }]}>
                  <Ionicons name="warning-outline" size={14} color={C.warning} />
                  <Text style={[s.warnText, { color: C.warning }]}>
                    This is your only counter. Contractor accepts or declines — no further negotiation.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[s.sendBtn, { backgroundColor: C.warning, opacity: saving ? 0.6 : 1 }]}
                  onPress={sendCounter}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="send" size={15} color="#fff" />
                        <Text style={s.sendBtnText}>Send Counter</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Counter sent: waiting for contractor ─────────────────────────────────────
  if (offer.status === 'countered') {
    const tc = timer.urgent ? C.error : timer.warning ? C.warning : C.textTertiary;
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <Header title="Counter Sent" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <ScrollView contentContainerStyle={s.scroll}>
          <Banner icon="send" color={C.warning} bg={C.warningMuted}
            text="Counter sent — awaiting contractor response" />

          <View style={[s.summaryCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={s.splitRow}>
              <View style={s.splitCol}>
                <Text style={[s.splitTag, { color: C.textTertiary }]}>QUOTED</Text>
                <Text style={[s.splitPrice, { color: C.textSecondary }]}>
                  ${offer.quoted_price?.toLocaleString('en-US')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={C.textTertiary} />
              <View style={[s.splitCol, { alignItems: 'flex-end' }]}>
                <Text style={[s.splitTag, { color: C.textTertiary }]}>YOUR COUNTER</Text>
                <Text style={[s.splitPrice, { color: C.warning }]}>
                  ${offer.counter_price?.toLocaleString('en-US')}
                </Text>
              </View>
            </View>
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

          <Text style={[s.hint, { color: C.textTertiary }]}>
            The contractor has 2 hours to respond. You'll get a notification of their decision.
          </Text>
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
              style={[s.sendBtn, { backgroundColor: C.primary, width: '100%', marginTop: SP[4] }]}
              onPress={() => router.replace(`/job/${bookingId}` as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="briefcase-outline" size={16} color="#fff" />
              <Text style={s.sendBtnText}>View Booking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Declined / Expired ────────────────────────────────────────────────────────
  const isExpired = offer.status === 'expired';
  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <Header title={isExpired ? 'Quote Expired' : 'Offer Ended'} onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <View style={s.center}>
        <View style={[s.resultCard, { backgroundColor: C.surface, borderColor: C.error + '60' }]}>
          <View style={[s.resultIcon, { backgroundColor: C.errorMuted }]}>
            <Ionicons name={isExpired ? 'time' : 'close-circle'} size={40} color={C.error} />
          </View>
          <Text style={[s.resultTitle, { color: C.textPrimary }]}>
            {isExpired ? 'Quote Expired' : 'Offer Declined'}
          </Text>
          <Text style={[s.resultSub, { color: C.textSecondary }]}>
            {isExpired
              ? "The contractor's quote timed out. Contact them to request a fresh quote."
              : 'The negotiation has ended. You can search for another contractor.'}
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

  waitCard:  { width: '100%', borderRadius: R.xl, borderWidth: 0.5, padding: SP[6], alignItems: 'center', gap: SP[3] },
  waitEmoji: { fontSize: 36 },
  waitTitle: { fontSize: TY.md, fontWeight: '800' },
  waitSub:   { fontSize: TY.sm, textAlign: 'center', lineHeight: 20 },

  quoteCard:   { borderRadius: R.xl, borderWidth: 1, padding: SP[5], marginBottom: SP[4], gap: SP[4] },
  quoteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fromLabel:   { fontSize: TY.xs, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  fromName:    { fontSize: TY.base, fontWeight: '800' },
  newBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: R.full, paddingHorizontal: SP[3], paddingVertical: SP[1] },
  newBadgeText:{ fontSize: TY.xs, fontWeight: '800' },
  bigPrice:    { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  noteBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: SP[2], padding: SP[3], borderRadius: R.md, borderWidth: 0.5 },
  noteBoxText: { fontSize: TY.sm, lineHeight: 18, flex: 1 },
  timerRow:    { flexDirection: 'row', alignItems: 'center', gap: SP[2], paddingTop: SP[3], borderTopWidth: 0.5 },
  timerText:   { fontSize: TY.sm, fontWeight: '700' },

  actionStack: { gap: SP[3], marginTop: SP[2] },
  acceptBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: R.lg, paddingVertical: SP[4] },
  acceptBtnText:{ fontSize: TY.base, fontWeight: '800', color: '#fff' },
  counterBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: R.lg, borderWidth: 1.5, paddingVertical: SP[4] },
  counterBtnText:{ fontSize: TY.base, fontWeight: '800' },
  declineBtn:  { alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1.5, paddingVertical: SP[4] },
  declineBtnText:{ fontSize: TY.base, fontWeight: '700' },

  counterForm:       { borderRadius: R.xl, borderWidth: 1, padding: SP[5], gap: SP[3], marginTop: SP[2] },
  counterFormHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counterFormTitle:  { fontSize: TY.md, fontWeight: '800' },
  minLabel:          { fontSize: TY.xs, lineHeight: 17 },
  priceRow:          { flexDirection: 'row', alignItems: 'center', borderRadius: R.lg, borderWidth: 1, paddingHorizontal: SP[4], height: 64 },
  dollar:            { fontSize: TY.xl, fontWeight: '800', marginRight: SP[1] },
  priceInput:        { flex: 1, fontSize: TY['2xl'], fontWeight: '900', paddingVertical: 0 },
  noteInput:         { borderRadius: R.lg, borderWidth: 1, padding: SP[4], minHeight: 80, fontSize: TY.sm, lineHeight: 20, textAlignVertical: 'top' },
  warnBox:           { flexDirection: 'row', alignItems: 'flex-start', gap: SP[2], padding: SP[3], borderRadius: R.md, borderWidth: 1 },
  warnText:          { fontSize: TY.xs, flex: 1, lineHeight: 17, fontWeight: '600' },
  sendBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], borderRadius: R.lg, paddingVertical: SP[4] },
  sendBtnText:       { fontSize: TY.base, fontWeight: '800', color: '#fff' },

  summaryCard: { borderRadius: R.xl, borderWidth: 0.5, padding: SP[5], marginBottom: SP[4], gap: SP[3] },
  splitRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP[2] },
  splitCol:    { alignItems: 'flex-start', gap: 4 },
  splitTag:    { fontSize: TY.xs, fontWeight: '700', letterSpacing: 0.5 },
  splitPrice:  { fontSize: TY.xl, fontWeight: '900' },
  hint:        { fontSize: TY.xs, lineHeight: 18, textAlign: 'center', paddingHorizontal: SP[2], marginTop: SP[2] },

  resultCard:  { width: '100%', borderRadius: R.xl, borderWidth: 1, padding: SP[6], alignItems: 'center', gap: SP[3] },
  resultIcon:  { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: TY.lg, fontWeight: '900', letterSpacing: -0.3 },
  resultPrice: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  resultSub:   { fontSize: TY.sm, textAlign: 'center', lineHeight: 20 },
});
