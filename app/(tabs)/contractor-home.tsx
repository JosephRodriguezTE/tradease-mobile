// app/(tabs)/contractor-home.tsx
// Full contractor home screen — Phase 1
// Online/offline · earnings · live job feed · urgency filters · missed money
// Employee-aware: employees see employer's job feed and company stats

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole, EmployeeRecord } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { deriveChatId } from '@/lib/messageService';
import { startLiveTracking, stopLiveTracking } from '@/lib/locationService';
import { haversine } from '@/lib/geo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
    Platform, RefreshControl,
    ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  trade: string;
  description: string;
  urgency: string | null;
  price_estimate: number | null;
  payout_max: number | null;
  job_lat: number | null;
  job_lng: number | null;
  job_address: string | null;
  customer_name: string;
  customer_id: string;
  customer_rating: number | null;
  created_at: string;
  distance_miles?: number;
  priority?: boolean;
  priorityType?: 'leads' | 'pro';
  is_instant_book?: boolean;
  instant_book_price?: number | null;
}

interface Earnings {
  today: number;
  this_week: number;
  jobs_today: number;
  jobs_this_week: number;
}

type Filter = 'all' | 'emergency' | 'high_pay' | 'nearby' | 'quick';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}


function getJobStatusLabel(status: string) {
  return ({ confirmed: 'Confirmed', in_progress: 'In Progress', completed: 'Awaiting Payment' } as Record<string,string>)[status] ?? status;
}
function getJobStatusColor(status: string) {
  return ({ confirmed: '#22C55E', in_progress: '#38BDF8', completed: '#FBBF24' } as Record<string,string>)[status] ?? '#9CA3AF';
}
function getJobStatusBg(status: string) {
  return ({ confirmed: 'rgba(34,197,94,0.1)', in_progress: 'rgba(56,189,248,0.1)', completed: 'rgba(251,191,36,0.1)' } as Record<string,string>)[status] ?? 'rgba(156,163,175,0.1)';
}

const TRADE_ICON: Record<string, string> = {
  Plumbing: '🔧', Electrical: '⚡', HVAC: '❄️', Carpentry: '🪚',
  Roofing: '🏠', Painting: '🎨', Landscaping: '🌿', Handyman: '🔨',
};

const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   range: '8AM – 12PM', hour: 8  },
  { id: 'afternoon', label: 'Afternoon', range: '12PM – 5PM', hour: 12 },
  { id: 'evening',   label: 'Evening',   range: '5PM – 8PM',  hour: 17 },
  { id: 'allday',    label: 'All Day',   range: '8AM – 5PM',  hour: 8  },
] as const;
type SlotId = typeof TIME_SLOTS[number]['id'];

function parseJobDateTime(dateStr: string, slotId: SlotId | null): string | null {
  if (!dateStr || !slotId) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 2024 || m > 12 || d > 31) return null;
  const slot = TIME_SLOTS.find(s => s.id === slotId);
  const dt = new Date(y, m - 1, d, slot?.hour ?? 9, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({ offer, onRespond, C }: {
  offer: any;
  onRespond: (offerId: string, bookingId: string, counterPrice: number, accept: boolean) => void;
  C: any;
}) {
  const booking      = offer.booking ?? {};
  const isCountered  = offer.status === 'countered';
  const counterPrice = offer.counter_price ?? 0;
  const quotedPrice  = offer.quoted_price ?? 0;

  return (
    <View style={[oc.card, { backgroundColor: C.surface, borderColor: isCountered ? '#FBBF24' : C.border }]}>
      {isCountered && (
        <View style={oc.counterBadge}>
          <Text style={oc.counterBadgeText}>⚡ Counter Received</Text>
        </View>
      )}
      <Text style={[oc.trade, { color: C.textPrimary }]}>{booking.trade ?? 'Job'}</Text>
      {!!booking.description && (
        <Text style={[oc.desc, { color: C.textSecondary }]} numberOfLines={2}>{booking.description}</Text>
      )}
      <View style={oc.priceRow}>
        <View style={oc.priceItem}>
          <Text style={[oc.priceLabel, { color: C.textMuted }]}>YOUR QUOTE</Text>
          <Text style={[oc.priceValue, { color: C.textPrimary }]}>${quotedPrice.toLocaleString()}</Text>
        </View>
        {isCountered && (
          <>
            <Text style={[oc.arrow, { color: C.textMuted }]}>→</Text>
            <View style={oc.priceItem}>
              <Text style={[oc.priceLabel, { color: C.textMuted }]}>CUSTOMER COUNTER</Text>
              <Text style={[oc.priceValue, { color: '#FBBF24' }]}>${counterPrice.toLocaleString()}</Text>
            </View>
          </>
        )}
      </View>
      {offer.counter_note ? (
        <Text style={[oc.note, { color: C.textSecondary }]}>"{offer.counter_note}"</Text>
      ) : null}
      {isCountered ? (
        <View style={oc.actions}>
          <TouchableOpacity
            style={[oc.btn, oc.declineBtn]}
            onPress={() => onRespond(offer.id, booking.id, counterPrice, false)}
          >
            <Text style={oc.declineBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[oc.btn, oc.acceptBtn]}
            onPress={() => onRespond(offer.id, booking.id, counterPrice, true)}
          >
            <Text style={oc.acceptBtnText}>Accept ${counterPrice.toLocaleString()}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[oc.waitingRow]}>
          <ActivityIndicator size="small" color={C.orange} />
          <Text style={[oc.waitingText, { color: C.textMuted }]}>Waiting for customer response…</Text>
        </View>
      )}
    </View>
  );
}

const oc = StyleSheet.create({
  card:           { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  counterBadge:   { backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  counterBadgeText:{ fontSize: 11, fontWeight: '800', color: '#FBBF24' },
  trade:          { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  desc:           { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  priceItem:      { flex: 1 },
  priceLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  priceValue:     { fontSize: 18, fontWeight: '900' },
  arrow:          { fontSize: 18, fontWeight: '700' },
  note:           { fontSize: 12, fontStyle: 'italic', marginBottom: 8 },
  actions:        { flexDirection: 'row', gap: 10 },
  btn:            { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  declineBtn:     { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  acceptBtn:      { backgroundColor: '#22C55E' },
  acceptBtnText:  { fontSize: 14, fontWeight: '800', color: '#fff' },
  waitingRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingText:    { fontSize: 12 },
});

// ─── Declined Offer Card ──────────────────────────────────────────────────────

function DeclinedOfferCard({ offer, onDelete, C }: {
  offer: any;
  onDelete: (offerId: string) => void;
  C: any;
}) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const expiry = new Date(offer.offered_at).getTime() + 24 * 60 * 60 * 1000;
    const tick = () => {
      const ms = expiry - Date.now();
      if (ms <= 0) { setCountdown('Expired'); onDelete(offer.id); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [offer.id, offer.offered_at, onDelete]);

  const bk = offer.booking ?? {};

  return (
    <View style={[dc.card, { backgroundColor: C.surface, borderColor: 'rgba(239,68,68,0.3)' }]}>
      <View style={dc.header}>
        <View style={dc.badge}><Text style={dc.badgeText}>DECLINED</Text></View>
        <TouchableOpacity style={dc.deleteBtn} onPress={() => onDelete(offer.id)}>
          <Ionicons name="trash-outline" size={14} color="#EF4444" />
          <Text style={dc.timer}>{countdown}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[dc.trade, { color: C.textPrimary }]}>{bk.trade ?? 'Job'}</Text>
      {!!bk.description && (
        <Text style={[dc.desc, { color: C.textSecondary }]} numberOfLines={2}>{bk.description}</Text>
      )}
      <View style={dc.priceRow}>
        <Text style={[dc.priceLabel, { color: C.textMuted }]}>YOUR QUOTE</Text>
        <Text style={[dc.price, { color: 'rgba(239,68,68,0.7)' }]}>${(offer.quoted_price ?? 0).toLocaleString()}</Text>
      </View>
    </View>
  );
}

const dc = StyleSheet.create({
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge:      { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  deleteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  timer:      { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  trade:      { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  desc:       { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  price:      { fontSize: 16, fontWeight: '800' },
});

// ─── Quote Bottom Sheet ───────────────────────────────────────────────────────

function QuoteBottomSheet({ booking, contractorId, visible, onClose, onSent }: {
  booking: Job | null;
  contractorId: string;
  visible: boolean;
  onClose: () => void;
  onSent: (jobId: string) => void;
}) {
  const [price,    setPrice]    = useState('');
  const [note,     setNote]     = useState('');
  const [jobDate,  setJobDate]  = useState('');
  const [timeSlot, setTimeSlot] = useState<SlotId | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  function reset() { setPrice(''); setNote(''); setJobDate(''); setTimeSlot(null); setError(''); }

  function handleDateChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length >= 3) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length >= 5) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    setJobDate(formatted);
  }

  async function sendQuote() {
    if (!booking) return;
    const numPrice = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!numPrice || numPrice <= 0) { setError('Enter a valid price.'); return; }
    if (!jobDate || jobDate.length < 10) { setError('Enter a job date (MM/DD/YYYY).'); return; }
    if (!timeSlot) { setError('Select a time slot.'); return; }

    const scheduledAt = parseJobDateTime(jobDate, timeSlot);
    if (!scheduledAt) { setError('Invalid date. Use MM/DD/YYYY format.'); return; }
    if (new Date(scheduledAt) <= new Date()) { setError('Job date must be in the future.'); return; }

    setLoading(true);
    setError('');

    const { data: existing } = await supabase
      .from('job_offers')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('contractor_id', contractorId)
      .in('status', ['pending', 'quoted', 'countered'])
      .maybeSingle();

    if (existing) {
      setError('You already have an active quote on this job.');
      setLoading(false);
      return;
    }

    const slot = TIME_SLOTS.find(s => s.id === timeSlot)!;
    const dateLabel = new Date(scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeLabel = `${slot.label} (${slot.range}) · ${dateLabel}`;
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const { error: err } = await supabase.from('job_offers').insert({
      booking_id:       booking.id,
      contractor_id:    contractorId,
      quoted_price:     numPrice,
      quote_note:       note.trim() || null,
      status:           'quoted',
      customer_action:  'pending',
      contractor_final: 'pending',
      expires_at:       expiresAt,
      scheduled_at:     scheduledAt,
      booking_time:     timeLabel,
    });

    if (err) { setLoading(false); setError('Could not send quote. Try again.'); return; }

    // Notify customer
    if ((booking as any).customer_id) {
      await supabase.from('notifications').insert({
        user_id: (booking as any).customer_id,
        type:    'quote_received',
        title:   'Quote Received',
        message: `A contractor quoted $${numPrice.toLocaleString()} for your ${booking.trade} job.`,
        data:    { booking_id: booking.id },
      });
    }

    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reset();
    onSent(booking.id);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={qbs.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={qbs.backdrop} onPress={onClose} activeOpacity={1} />
        <ScrollView style={qbs.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 44 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={qbs.handle} />
          <Text style={qbs.title}>Send a Quote</Text>
          {!!booking && (
            <Text style={qbs.sub} numberOfLines={2}>
              {booking.trade}
              {booking.description ? ` · ${booking.description.slice(0, 80)}` : ''}
            </Text>
          )}

          <Text style={qbs.label}>YOUR PRICE</Text>
          <View style={qbs.priceRow}>
            <Text style={qbs.dollar}>$</Text>
            <TextInput
              style={qbs.priceInput}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#5A5A70"
              autoFocus
            />
          </View>

          <Text style={qbs.label}>JOB DATE</Text>
          <View style={qbs.dateRow}>
            <Text style={qbs.dateIcon}>📅</Text>
            <TextInput
              style={qbs.dateInput}
              value={jobDate}
              onChangeText={handleDateChange}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#5A5A70"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </View>

          <Text style={qbs.label}>TIME SLOT</Text>
          <View style={qbs.slotGrid}>
            {TIME_SLOTS.map(slot => (
              <TouchableOpacity
                key={slot.id}
                style={[qbs.slotBtn, timeSlot === slot.id && qbs.slotBtnActive]}
                onPress={() => setTimeSlot(slot.id)}
                activeOpacity={0.75}
              >
                <Text style={[qbs.slotLabel, timeSlot === slot.id && qbs.slotLabelActive]}>{slot.label}</Text>
                <Text style={[qbs.slotRange, timeSlot === slot.id && qbs.slotRangeActive]}>{slot.range}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={qbs.label}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={qbs.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Describe your approach, timeline, or materials..."
            placeholderTextColor="#5A5A70"
            multiline
            numberOfLines={3}
          />
          {!!error && <Text style={qbs.error}>{error}</Text>}
          <Text style={qbs.expireNote}>⏱ Quote expires in 4 hours · Customer may counter once</Text>
          <TouchableOpacity
            style={[qbs.sendBtn, loading && { opacity: 0.5 }]}
            onPress={sendQuote}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={qbs.sendBtnText}>Send Quote</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const qbs = StyleSheet.create({
  overlay:         { flex: 1, justifyContent: 'flex-end' },
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:           { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 0.5, borderColor: '#2A2A38', borderBottomWidth: 0, maxHeight: '90%' },
  handle:          { width: 40, height: 4, borderRadius: 2, backgroundColor: '#2A2A38', alignSelf: 'center', marginBottom: 6 },
  title:           { fontSize: 19, fontWeight: '800', color: '#F0F0F5' },
  sub:             { fontSize: 13, color: '#9090A8', lineHeight: 18 },
  label:           { fontSize: 10, fontWeight: '800', color: '#5A5A70', letterSpacing: 0.9, marginTop: 6 },
  priceRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C26', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A38', paddingHorizontal: 16, height: 64 },
  dollar:          { fontSize: 22, fontWeight: '800', color: '#9090A8', marginRight: 4 },
  priceInput:      { flex: 1, fontSize: 30, fontWeight: '900', color: '#F0F0F5', paddingVertical: 0 },
  dateRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C26', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A38', paddingHorizontal: 16, height: 52, gap: 10 },
  dateIcon:        { fontSize: 18 },
  dateInput:       { flex: 1, fontSize: 17, fontWeight: '700', color: '#F0F0F5', paddingVertical: 0 },
  slotGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn:         { flex: 1, minWidth: '45%', borderRadius: 12, borderWidth: 1.5, borderColor: '#2A2A38', backgroundColor: '#1C1C26', paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', gap: 2 },
  slotBtnActive:   { borderColor: '#FF6200', backgroundColor: 'rgba(255,98,0,0.12)' },
  slotLabel:       { fontSize: 13, fontWeight: '700', color: '#666' },
  slotLabelActive: { color: '#FF6200' },
  slotRange:       { fontSize: 11, color: '#444' },
  slotRangeActive: { color: 'rgba(255,98,0,0.7)' },
  noteInput:       { backgroundColor: '#1C1C26', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A38', padding: 14, fontSize: 13, color: '#F0F0F5', lineHeight: 19, textAlignVertical: 'top', minHeight: 80 },
  error:           { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  expireNote:      { fontSize: 11, color: '#5A5A70', textAlign: 'center' },
  sendBtn:         { backgroundColor: '#FF6200', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sendBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },
});

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, onQuote, onAccept, C, verified, canAcceptJobs }: {
  job: Job;
  onQuote: (job: Job) => void;
  onAccept: (job: Job) => void;
  C: any;
  verified: boolean;
  canAcceptJobs: boolean;
}) {
  const icon = TRADE_ICON[job.trade] ?? '🔧';
  const payLow  = job.price_estimate ?? 0;
  const payHigh = job.payout_max ?? Math.round(payLow * 1.4);

  const priorityColor = job.priorityType === 'pro' ? '#FBBF24' : C.orange;

  return (
    <View style={[
      jc.card,
      { backgroundColor: C.surface, borderColor: C.border },
      job.priority && { borderColor: priorityColor, borderWidth: 1.5 },
    ]}>
      {/* Priority lead label */}
      {job.priority && (
        <View style={[jc.priorityPill, { backgroundColor: priorityColor + '18' }]}>
          <Text style={[jc.priorityText, { color: priorityColor }]}>⚡ Priority Lead</Text>
        </View>
      )}
      {/* Header row */}
      <View style={jc.header}>
        <View style={jc.tradeRow}>
          <Text style={jc.tradeIcon}>{icon}</Text>
          <View>
            <Text style={[jc.tradeName, { color: C.textPrimary }]}>{job.trade}</Text>
            {job.urgency === 'emergency' && (
              <View style={[jc.urgencyPill, { backgroundColor: '#EF444420' }]}>
                <Text style={[jc.urgencyText, { color: '#EF4444' }]}>🚨 Emergency</Text>
              </View>
            )}
          </View>
        </View>
        <View style={jc.payBox}>
          <Text style={[jc.payAmount, { color: C.orange }]}>
            {fmt(payLow)}–{fmt(payHigh)}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text style={[jc.desc, { color: C.textSecondary }]} numberOfLines={2}>
        {job.description}
      </Text>

      {/* Meta row */}
      <View style={jc.meta}>
        {job.distance_miles !== undefined && (
          <View style={jc.metaItem}>
            <Ionicons name="location-outline" size={13} color={C.textMuted} />
            <Text style={[jc.metaText, { color: C.textSecondary }]}>
              {job.job_address ?? `${job.distance_miles.toFixed(1)} mi`}
            </Text>
          </View>
        )}
        <View style={jc.metaItem}>
          <Ionicons name="time-outline" size={13} color={C.textMuted} />
          <Text style={[jc.metaText, { color: C.textSecondary }]}>{timeAgo(job.created_at)}</Text>
        </View>
        {job.customer_rating && (
          <View style={jc.metaItem}>
            <Ionicons name="star" size={13} color="#FBBF24" />
            <Text style={[jc.metaText, { color: C.textSecondary }]}>{job.customer_rating.toFixed(1)} customer</Text>
          </View>
        )}
      </View>

      {/* Accept button */}
      {!verified ? (
        <View style={[jc.acceptBtn, jc.acceptBtnLocked]}>
          <Ionicons name="lock-closed-outline" size={16} color="#555" />
          <Text style={jc.acceptTextLocked}>Get Verified to Accept</Text>
        </View>
      ) : !canAcceptJobs ? (
        <View style={[jc.acceptBtn, jc.acceptBtnLocked]}>
          <Ionicons name="ban-outline" size={16} color="#555" />
          <Text style={jc.acceptTextLocked}>Contact manager to enable job acceptance</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[jc.acceptBtn, job.is_instant_book ? { backgroundColor: '#16A34A' } : { backgroundColor: C.orange }]}
          onPress={() => job.is_instant_book ? onAccept(job) : onQuote(job)}
          activeOpacity={0.8}
        >
          {job.is_instant_book
            ? <><Text style={{ fontSize: 16 }}>⚡</Text><Text style={jc.acceptText}>Accept Job · ${(job.instant_book_price ?? job.price_estimate ?? 0).toLocaleString()}</Text></>
            : <><Ionicons name="pricetag-outline" size={18} color="#fff" /><Text style={jc.acceptText}>Send Quote</Text></>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

const jc = StyleSheet.create({
  card:       { borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 12 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  tradeRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  tradeIcon:  { fontSize: 26 },
  tradeName:  { fontSize: 16, fontWeight: '700' },
  urgencyPill:{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3, alignSelf: 'flex-start' },
  urgencyText:{ fontSize: 11, fontWeight: '700' },
  payBox:     { alignItems: 'flex-end' },
  payAmount:  { fontSize: 15, fontWeight: '800' },
  desc:       { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  meta:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  metaItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:   { fontSize: 12 },
  acceptBtn:       { borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptBtnLocked: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
  acceptText:      { fontSize: 15, fontWeight: '700', color: '#fff' },
  acceptTextLocked:{ fontSize: 14, fontWeight: '600', color: '#555' },
  priorityPill:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' as const, marginBottom: 8 },
  priorityText:    { fontSize: 11, fontWeight: '800' as const },
});

// ─── Filter Chips ─────────────────────────────────────────────────────────────

const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: 'all',       label: 'All Jobs',  icon: 'apps-outline'         },
  { key: 'emergency', label: 'Emergency', icon: 'flash-outline'        },
  { key: 'high_pay',  label: 'High Pay',  icon: 'trending-up-outline'  },
  { key: 'nearby',    label: 'Nearby',    icon: 'location-outline'     },
  { key: 'quick',     label: 'Quick',     icon: 'timer-outline'        },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ContractorHomeScreen() {
  const router   = useRouter();
  const { colors: C } = useTheme();
  useAuth();
  const { isEmployee, isOwner, employeeRecord, employerContractorId } = useRole();

  // Keep role info in a ref so callbacks always see current values
  const roleRef = useRef<{
    isEmployee: boolean;
    employerContractorId: string | null;
    employeeRecord: EmployeeRecord | null;
  }>({ isEmployee: false, employerContractorId: null, employeeRecord: null });

  useEffect(() => {
    roleRef.current = { isEmployee, employerContractorId, employeeRecord };
  }, [isEmployee, employerContractorId, employeeRecord]);

  const [contractor, setContractor] = useState<any>(null);
  const [earnings,   setEarnings]   = useState<Earnings | null>(null);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [activeOffers,   setActiveOffers]   = useState<any[]>([]);
  const [declinedOffers, setDeclinedOffers] = useState<any[]>([]);
  const [activeJobs,     setActiveJobs]     = useState<any[]>([]);
  const [quoteTarget,  setQuoteTarget]  = useState<Job | null>(null);
  const [quotedJobIds, setQuotedJobIds] = useState<Set<string>>(new Set());
  const [filter,     setFilter]     = useState<Filter>('all');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [missedJobs, setMissedJobs] = useState<{ count: number; value: number } | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const channelRef    = useRef<any>(null);
  const contractorRef = useRef<any>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    // If employee, load employer's contractor profile
    const { isEmployee: isEmp, employerContractorId: empCtId } = roleRef.current;
    const contractorId = isEmp && empCtId ? empCtId : currentUser.id;

    // Contractor profile
    const { data: c } = await supabase
      .from('contractors')
      .select('id,company_name,username,is_available,lat,lng,rating,push_token,trade_type,verification_status,plan')
      .eq('id', contractorId)
      .single();
    setContractor(c);

    // Earnings — always for the contractor account (employer if employee)
    try {
      const { data: e } = await supabase
        .from('contractor_earnings')
        .select('*')
        .eq('contractor_id', contractorId)
        .maybeSingle();
      setEarnings(e ?? { today: 0, this_week: 0, jobs_today: 0, jobs_this_week: 0 });
    } catch {
      setEarnings({ today: 0, this_week: 0, jobs_today: 0, jobs_this_week: 0 });
    }

    // Open jobs — unassigned, pending, matching this contractor's trade,
    // within 30 miles, request/post window not expired
    const nowIso = new Date().toISOString();
    let openJobsQuery = supabase
      .from('bookings')
      .select('id,trade,description,urgency,price_estimate,payout_max,job_lat,job_lng,job_address,customer_name,customer_id,customer_rating,created_at,is_instant_book,instant_book_price,request_expires_at')
      .is('contractor_id', null)
      .eq('status', 'pending')
      .or(`request_expires_at.gt.${nowIso},request_expires_at.is.null`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (c?.trade_type) openJobsQuery = openJobsQuery.eq('trade', c.trade_type);
    const { data: rawJobs } = await openJobsQuery;

    if (rawJobs && c?.lat && c?.lng) {
      const withDist = rawJobs
        .map(j => ({
          ...j,
          distance_miles: j.job_lat && j.job_lng
            ? haversine(c.lat, c.lng, j.job_lat, j.job_lng)
            : 99,
        }))
        .filter(j => j.distance_miles <= 30)
        .sort((a, b) => a.distance_miles - b.distance_miles);
      setJobs(withDist);
    } else {
      setJobs(rawJobs ?? []);
    }

    // Missed money — jobs that came in while offline yesterday, still actually claimable
    const { count: missedCount, data: missedData } = await supabase
      .from('bookings')
      .select('price_estimate', { count: 'exact' })
      .is('contractor_id', null)
      .eq('status', 'pending')
      .or(`request_expires_at.gt.${nowIso},request_expires_at.is.null`)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString());

    if (missedCount && missedCount > 0 && !c?.is_available) {
      const totalVal = (missedData ?? []).reduce((s, j) => s + (j.price_estimate ?? 0), 0);
      setMissedJobs({ count: missedCount, value: totalVal });
    } else {
      setMissedJobs(null);
    }

    // Active job offers (quoted or countered)
    const { data: offers } = await supabase
      .from('job_offers')
      .select('*, booking:bookings(id,trade,description,price_estimate,job_address,customer_name,status)')
      .eq('contractor_id', contractorId)
      .in('status', ['quoted', 'countered'])
      .order('offered_at', { ascending: false });
    setActiveOffers(offers ?? []);

    // Declined offers from the last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: declined } = await supabase
      .from('job_offers')
      .select('*, booking:bookings(id,trade,description,price_estimate,customer_name)')
      .eq('contractor_id', contractorId)
      .eq('status', 'declined')
      .gte('offered_at', cutoff)
      .order('offered_at', { ascending: false });
    setDeclinedOffers(declined ?? []);

    // Active / confirmed jobs for this contractor
    const { data: confirmedJobs } = await supabase
      .from('bookings')
      .select('id, trade, description, customer_name, status, price_estimate')
      .eq('contractor_id', contractorId)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(10);
    setActiveJobs(confirmedJobs ?? []);

    // Unread notification count — always for the logged-in user
    const { count: notifCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('read', false);
    setUnreadNotifCount(notifCount ?? 0);

    if (!quiet) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { contractorRef.current = contractor; }, [contractor]);

  // ── Realtime — new jobs ping instantly ───────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`jobs_feed_${Math.random().toString(36).slice(2, 9)}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        (payload) => {
          const c    = contractorRef.current;
          const plan = c?.plan as string | undefined;
          const raw  = payload.new as any;

          if ((plan === 'leads' || plan === 'pro') && raw?.id && !raw.contractor_id && raw.status === 'pending') {
            const priorityJob: Job = {
              id:              raw.id,
              trade:           raw.trade ?? '',
              description:     raw.description ?? '',
              urgency:         raw.urgency ?? null,
              price_estimate:  raw.price_estimate ?? null,
              payout_max:      raw.payout_max ?? null,
              job_lat:         raw.job_lat ?? null,
              job_lng:         raw.job_lng ?? null,
              job_address:     raw.job_address ?? null,
              customer_id:     raw.customer_id ?? '',
              customer_name:   raw.customer_name ?? 'Customer',
              customer_rating: raw.customer_rating ?? null,
              created_at:      raw.created_at,
              distance_miles:  raw.job_lat && raw.job_lng && c?.lat && c?.lng
                ? haversine(c.lat, c.lng, raw.job_lat, raw.job_lng)
                : undefined,
              priority:        true,
              priorityType:    plan as 'leads' | 'pro',
            };
            setJobs(prev => [priorityJob, ...prev.filter(j => j.id !== raw.id)]);
          } else {
            load(true);
          }
        })
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // ── Realtime — notification badge ───────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let ch: any = null;

    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser || !mounted) return;

      const refetchCount = async () => {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', currentUser.id)
          .eq('read', false);
        if (mounted) setUnreadNotifCount(count ?? 0);
      };

      ch = supabase
        .channel(`notif_badge:${currentUser.id}:${Math.random().toString(36).slice(2, 7)}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        }, () => { if (mounted) setUnreadNotifCount(prev => prev + 1); })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        }, refetchCount)
        .subscribe();
    });

    return () => {
      mounted = false;
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  // ── Realtime — offer state changes ──────────────────────────────────────────
  useEffect(() => {
    if (!contractor?.id) return;
    const ch = supabase
      .channel(`offers_feed:${contractor.id}:${Math.random().toString(36).slice(2, 9)}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'job_offers',
        filter: `contractor_id=eq.${contractor.id}`,
      }, (payload) => {
        const action = (payload.new as any)?.customer_action;
        if (action === 'accepted') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Quote Accepted 🎉', 'The customer accepted your quote. Job is confirmed — check Messages.');
        } else if (action === 'countered') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Alert.alert('Counter Received', 'The customer sent a counter offer. Review it in My Quotes.');
        } else if (action === 'declined') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Quote Declined', 'The customer declined your quote.');
        }
        load(true);
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'job_offers',
        filter: `contractor_id=eq.${contractor.id}`,
      }, () => { load(true); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contractor?.id, load]);

  // ── Respond to counter ────────────────────────────────────────────────────────
  async function respondToCounter(offerId: string, bookingId: string, counterPrice: number, accept: boolean) {
    if (accept) {
      const { error } = await supabase
        .from('job_offers')
        .update({ status: 'accepted', contractor_final: 'accepted' })
        .eq('id', offerId);
      if (error) { Alert.alert('Error', 'Could not accept. Try again.'); return; }

      await supabase
        .from('bookings')
        .update({ status: 'confirmed', price_estimate: counterPrice, contractor_id: contractor.id })
        .eq('id', bookingId);

      // Create work order so both parties can access it immediately
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('customer_id, customer_name, trade, job_address, notes')
        .eq('id', bookingId)
        .single();
      if (bookingRow) {
        await supabase.from('work_orders').upsert({
          booking_id:      bookingId,
          contractor_id:   contractor.id,
          customer_id:     bookingRow.customer_id,
          service_type:    bookingRow.trade,
          job_address:     bookingRow.job_address || bookingRow.notes || '',
          contractor_name: contractor.company_name || '',
          customer_name:   bookingRow.customer_name || '',
          status:          'active',
          wo_status:       'accepted',
        }, { onConflict: 'booking_id', ignoreDuplicates: true });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActiveOffers(prev => prev.filter(o => o.id !== offerId));
      Alert.alert('Counter Accepted', 'You accepted the counter offer. Check Messages.');
    } else {
      Alert.alert('Decline Counter', 'Walk away from this job?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: async () => {
          await supabase
            .from('job_offers')
            .update({ status: 'declined', contractor_final: 'declined' })
            .eq('id', offerId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setActiveOffers(prev => prev.filter(o => o.id !== offerId));
        }},
      ]);
    }
  }

  // ── Online/offline toggle — owners only ──────────────────────────────────────
  async function toggleOnline() {
    if (!contractor || roleRef.current.isEmployee) return;
    setTogglingOnline(true);
    const next = !contractor.is_available;
    const { error } = await supabase
      .from('contractors')
      .update({ is_available: next, is_online: next })
      .eq('id', contractor.id);
    if (!error) {
      setContractor((p: any) => ({ ...p, is_available: next, is_online: next }));
      if (next) {
        // Start broadcasting GPS when going online
        startLiveTracking(contractor.id).catch(() => {});
      } else {
        // Stop broadcasting and mark offline in location table
        stopLiveTracking();
        supabase.from('contractor_locations').upsert({
          contractor_id: contractor.id,
          is_online: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'contractor_id' }).then(() => {});
      }
    }
    setTogglingOnline(false);
  }

  // ── Auto-start tracking if already online on mount ────────────────────────────
  useEffect(() => {
    if (contractor?.is_available && !roleRef.current.isEmployee) {
      startLiveTracking(contractor.id).catch(() => {});
    }
    return () => { stopLiveTracking(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractor?.id, contractor?.is_available]);

  // ── Delete declined offer from view ──────────────────────────────────────────
  function handleDeleteDeclined(offerId: string) {
    setDeclinedOffers(prev => prev.filter(o => o.id !== offerId));
  }

  // ── Quote / accept job ────────────────────────────────────────────────────────
  function handleQuote(job: Job) {
    setQuoteTarget(job);
  }

  async function handleAcceptInstantBook(job: Job) {
    if (!contractor) return;
    const { data: claimed, error } = await supabase.from('bookings').update({
      contractor_id: contractor.id,
      status: 'confirmed',
    }).eq('id', job.id).select();
    if (error) { Alert.alert('Error', 'Could not accept job. Try again.'); return; }
    if (!claimed || claimed.length === 0) {
      Alert.alert('Job Unavailable', 'This job was already accepted by another contractor.');
      return;
    }
    await supabase.from('work_orders').upsert({
      booking_id:      job.id,
      contractor_id:   contractor.id,
      customer_id:     job.customer_id,
      service_type:    job.trade,
      job_address:     job.job_address ?? '',
      contractor_name: contractor.company_name ?? '',
      customer_name:   job.customer_name ?? '',
      status:          'active',
      wo_status:       'accepted',
    }, { onConflict: 'booking_id', ignoreDuplicates: true });
    supabase.from('messages').insert({
      chat_id:      deriveChatId(job.customer_id, contractor.id),
      sender_id:    job.customer_id,
      recipient_id: contractor.id,
      sender_name:  'Tradease',
      body:         `⚡ ${job.trade ?? 'Job'} booked instantly — your contractor is confirmed and ready to begin.`,
      read:         false,
      is_system:    true,
      sender_role:  'system',
    }).then(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push(`/work-order/contractor?booking_id=${job.id}` as any);
  }

  // ── Filter jobs (excluding already-quoted ones for this session) ─────────────
  const filtered = jobs
    .filter(j => !quotedJobIds.has(j.id))
    .filter(j => {
      if (filter === 'emergency') return j.urgency === 'emergency';
      if (filter === 'high_pay')  return (j.price_estimate ?? 0) >= 200;
      if (filter === 'nearby')    return (j.distance_miles ?? 99) <= 5;
      if (filter === 'quick')     return (j.price_estimate ?? 999) <= 150;
      return true;
    });

  // Derived permission — employees can accept only if their record allows it
  const canAcceptJobs = !isEmployee || (employeeRecord?.can_accept_jobs ?? false);

  // ── Render ───────────────────────────────────────────────────────────────────
  const styles = makeStyles(C);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── Employee banner ──────────────────────────────────────────────────── */}
      {isEmployee && employeeRecord && (
        <View style={[styles.empBanner, { backgroundColor: 'rgba(56,189,248,0.10)', borderBottomColor: 'rgba(56,189,248,0.25)' }]}>
          <Ionicons name="people-outline" size={14} color="#38BDF8" />
          <Text style={styles.empBannerText}>
            Working for <Text style={{ fontWeight: '800', color: '#38BDF8' }}>{contractor?.company_name ?? '…'}</Text>
            {' '}·{' '}
            <Text style={{ color: '#38BDF8' }}>{employeeRecord.role}</Text>
          </Text>
        </View>
      )}

      {/* ── Top status bar ──────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Online toggle — owners only */}
        {isOwner ? (
          <TouchableOpacity style={styles.onlineRow} onPress={toggleOnline} disabled={togglingOnline}>
            {togglingOnline
              ? <ActivityIndicator size="small" color={C.orange} />
              : <View style={[styles.onlineDot, { backgroundColor: contractor?.is_available ? '#22C55E' : C.textMuted }]} />
            }
            <Text style={[styles.onlineLabel, { color: contractor?.is_available ? '#22C55E' : C.textMuted }]}>
              {contractor?.is_available ? 'Online' : 'Offline'}
            </Text>
            <Switch
              value={contractor?.is_available ?? false}
              onValueChange={toggleOnline}
              trackColor={{ false: C.border, true: '#22C55E40' }}
              thumbColor={contractor?.is_available ? '#22C55E' : C.textMuted}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.onlineRow}>
            <View style={[styles.onlineDot, { backgroundColor: contractor?.is_available ? '#22C55E' : C.textMuted }]} />
            <Text style={[styles.onlineLabel, { color: contractor?.is_available ? '#22C55E' : C.textMuted }]}>
              {contractor?.is_available ? 'Accepting Jobs' : 'Offline'}
            </Text>
          </View>
        )}

        {/* Earnings */}
        <View style={styles.earningsRow}>
          <View style={styles.earningItem}>
            <Text style={[styles.earningValue, { color: '#22C55E' }]}>{fmt(earnings?.today ?? 0)}</Text>
            <Text style={[styles.earningLabel, { color: C.textMuted }]}>today</Text>
          </View>
          <View style={[styles.earningDivider, { backgroundColor: C.border }]} />
          <View style={styles.earningItem}>
            <Text style={[styles.earningValue, { color: C.textPrimary }]}>{fmt(earnings?.this_week ?? 0)}</Text>
            <Text style={[styles.earningLabel, { color: C.textMuted }]}>this week</Text>
          </View>
        </View>

        {/* Notification bell */}
        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={22} color={C.textPrimary} />
          {unreadNotifCount > 0 && (
            <View style={[styles.bellBadge, { backgroundColor: C.orange }]}>
              <Text style={styles.bellBadgeText}>
                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Quick stats row ──────────────────────────────────────────────────── */}
      <View style={[styles.statsBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {[
          { icon: 'briefcase-outline',  value: earnings?.jobs_today ?? 0,    label: 'Today'    },
          { icon: 'calendar-outline',   value: earnings?.jobs_this_week ?? 0, label: 'This week'},
          { icon: 'radio-button-on',    value: filtered.length,               label: 'Open jobs'},
          { icon: 'star-outline',       value: contractor?.rating?.toFixed(1) ?? '—', label: 'Rating'},
        ].map((s, i) => (
          <View key={i} style={styles.statItem}>
            <Ionicons name={s.icon as any} size={14} color={C.orange} />
            <Text style={[styles.statValue, { color: C.textPrimary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={j => j.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={C.orange} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={() => (
          <>
            {/* Missed money banner */}
            {missedJobs && isOwner && (
              <View style={[styles.missedBanner, { backgroundColor: '#EF444412', borderColor: '#EF444430' }]}>
                <Ionicons name="wallet-outline" size={18} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.missedTitle}>
                    You missed {missedJobs.count} job{missedJobs.count > 1 ? 's' : ''} worth ~{fmt(missedJobs.value)} while offline
                  </Text>
                  <Text style={styles.missedSub}>Go online to start receiving jobs again</Text>
                </View>
                <TouchableOpacity onPress={toggleOnline}>
                  <Text style={styles.missedCta}>Go Online</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Declined quotes */}
            {declinedOffers.length > 0 && (
              <View style={{ marginTop: 14, marginBottom: 4 }}>
                <Text style={[styles.feedTitle, { color: '#EF4444', marginBottom: 10, opacity: 0.85 }]}>
                  Declined ({declinedOffers.length})
                </Text>
                {declinedOffers.map(offer => (
                  <DeclinedOfferCard
                    key={offer.id}
                    offer={offer}
                    onDelete={handleDeleteDeclined}
                    C={C}
                  />
                ))}
              </View>
            )}

            {/* My Quotes */}
            {activeOffers.length > 0 && (
              <View style={{ marginTop: 14, marginBottom: 4 }}>
                <Text style={[styles.feedTitle, { color: C.textPrimary, marginBottom: 10 }]}>
                  My Quotes ({activeOffers.length})
                </Text>
                {activeOffers.map(offer => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    onRespond={respondToCounter}
                    C={C}
                  />
                ))}
              </View>
            )}

            {/* Active Jobs */}
            {activeJobs.length > 0 && (
              <View style={{ marginTop: 14, marginBottom: 4 }}>
                <Text style={[styles.feedTitle, { color: C.textPrimary, marginBottom: 10 }]}>
                  Active Jobs ({activeJobs.length})
                </Text>
                {activeJobs.map(job => (
                  <TouchableOpacity
                    key={job.id}
                    style={[styles.activeJobCard, { backgroundColor: C.surface, borderColor: C.border }]}
                    onPress={() => router.push(`/work-order/contractor?booking_id=${job.id}` as any)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.activeJobRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.activeJobTrade, { color: C.textPrimary }]}>{job.trade}</Text>
                        {!!job.description && (
                          <Text style={[styles.activeJobDesc, { color: C.textSecondary }]} numberOfLines={1}>{job.description}</Text>
                        )}
                        <Text style={[styles.activeJobCustomer, { color: C.textMuted }]}>{job.customer_name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {!!job.price_estimate && (
                          <Text style={[styles.activeJobPrice, { color: C.orange }]}>${job.price_estimate}</Text>
                        )}
                        <View style={[styles.activeJobStatus, { backgroundColor: getJobStatusBg(job.status) }]}>
                          <Text style={[styles.activeJobStatusText, { color: getJobStatusColor(job.status) }]}>
                            {getJobStatusLabel(job.status)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.activeJobFooter, { borderTopColor: C.border }]}>
                      <Ionicons name="construct-outline" size={13} color={C.orange} />
                      <Text style={[styles.activeJobFooterText, { color: C.orange }]}>Tap to open Work Order</Text>
                      <Ionicons name="chevron-forward" size={13} color={C.orange} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, { backgroundColor: active ? C.orange : C.surface, borderColor: active ? C.orange : C.border }]}
                    onPress={() => setFilter(f.key)}
                  >
                    <Ionicons name={f.icon as any} size={14} color={active ? '#fff' : C.textSecondary} />
                    <Text style={[styles.chipText, { color: active ? '#fff' : C.textSecondary }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Feed header */}
            <View style={styles.feedHeader}>
              <View style={styles.feedLiveDot} />
              <Text style={[styles.feedTitle, { color: C.textPrimary }]}>Live Job Feed</Text>
              <Text style={[styles.feedCount, { color: C.textMuted }]}>{filtered.length} open</Text>
            </View>
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>No jobs right now</Text>
            <Text style={[styles.emptyText, { color: C.textMuted }]}>
              {isOwner && !contractor?.is_available
                ? 'Go online to start seeing jobs in your area.'
                : 'New jobs will appear here in real time. Pull to refresh.'}
            </Text>
            {isOwner && !contractor?.is_available && (
              <TouchableOpacity style={[styles.goOnlineBtn, { backgroundColor: C.orange }]} onPress={toggleOnline}>
                <Text style={styles.goOnlineText}>Go Online Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onQuote={handleQuote}
            onAccept={handleAcceptInstantBook}
            C={C}
            verified={contractor?.verification_status === 'approved'}
            canAcceptJobs={canAcceptJobs}
          />
        )}
      />

      <QuoteBottomSheet
        booking={quoteTarget}
        contractorId={contractor?.id ?? ''}
        visible={!!quoteTarget}
        onClose={() => setQuoteTarget(null)}
        onSent={(jobId) => {
          setQuotedJobIds(prev => new Set([...prev, jobId]));
          setQuoteTarget(null);
          load(true);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: any) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: C.background },
    center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
    empBannerText:{ fontSize: 12, fontWeight: '600', color: '#38BDF8', flex: 1 },
    topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border, gap: 12 },
    onlineRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    onlineDot:    { width: 8, height: 8, borderRadius: 4 },
    onlineLabel:  { fontSize: 13, fontWeight: '700' },
    earningsRow:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    earningItem:  { alignItems: 'center' },
    earningValue: { fontSize: 16, fontWeight: '800' },
    earningLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
    earningDivider:{ width: 1, height: 28 },
    bellBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    bellBadge:    { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    bellBadgeText:{ fontSize: 9, fontWeight: '800', color: '#fff' },
    statsBar:     { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 0.5 },
    statItem:     { flex: 1, alignItems: 'center', gap: 3 },
    statValue:    { fontSize: 15, fontWeight: '800' },
    statLabel:    { fontSize: 10, fontWeight: '600' },
    missedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14, marginTop: 14 },
    missedTitle:  { fontSize: 13, fontWeight: '700', color: '#EF4444', lineHeight: 18 },
    missedSub:    { fontSize: 12, color: '#EF4444', opacity: 0.7, marginTop: 2 },
    missedCta:    { fontSize: 13, fontWeight: '800', color: '#EF4444' },
    chip:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
    chipText:     { fontSize: 13, fontWeight: '600' },
    feedHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    feedLiveDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
    feedTitle:    { fontSize: 16, fontWeight: '800', flex: 1 },
    feedCount:    { fontSize: 13 },
    emptyState:   { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
    goOnlineBtn:  { marginTop: 20, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
    goOnlineText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    activeJobCard:        { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
    activeJobRow:         { flexDirection: 'row' as const, alignItems: 'flex-start' as const, padding: 14, gap: 12 },
    activeJobTrade:       { fontSize: 15, fontWeight: '800' as const, marginBottom: 2 },
    activeJobDesc:        { fontSize: 12, marginBottom: 4 },
    activeJobCustomer:    { fontSize: 12 },
    activeJobPrice:       { fontSize: 15, fontWeight: '800' as const },
    activeJobStatus:      { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
    activeJobStatusText:  { fontSize: 11, fontWeight: '700' as const },
    activeJobFooter:      { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 0.5 },
    activeJobFooterText:  { flex: 1, fontSize: 12, fontWeight: '600' as const },
  });
}
