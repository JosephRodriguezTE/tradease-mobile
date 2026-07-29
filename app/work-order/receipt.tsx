// app/work-order/receipt.tsx
// Customer receipt shown after job completion and payment release.

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const O = {
  bg:      '#0D0D0D',
  card:    '#161616',
  cardAlt: '#1C1C1C',
  border:  '#262626',
  orange:  '#FF6200',
  green:   '#22C55E',
  txt:     '#F0F0F0',
  txt2:    '#9A9A9A',
  txt3:    '#555555',
};

interface ReceiptData {
  work_order_number: string;
  service_type: string;
  contractor_name: string;
  completed_at: string | null;
  payment_intent_id: string | null;
  booking?: { job_address: string | null };
}

interface PIData {
  amount_cents: number;
  tip_cents?: number;
}

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [wo, setWo] = useState<ReceiptData | null>(null);
  const [pi, setPi] = useState<PIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: woData } = await supabase
        .from('work_orders')
        .select('work_order_number,service_type,contractor_name,completed_at,payment_intent_id,booking:bookings(job_address)')
        .eq('id', id)
        .maybeSingle();

      if (woData) {
        setWo(woData as any);
        if (woData.payment_intent_id) {
          const { data: piData } = await supabase
            .from('payment_intents')
            .select('amount_cents,tip_cents')
            .eq('id', woData.payment_intent_id)
            .maybeSingle();
          if (piData) setPi(piData as any);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const total = (pi?.amount_cents ?? 0) / 100;
  const tip = (pi?.tip_cents ?? 0) / 100;
  const subtotal = total - tip;

  const completedAt = wo?.completed_at
    ? new Date(wo.completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.replace('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <Ionicons name="close" size={22} color={O.txt} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Receipt</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Success badge */}
        <View style={s.successBadge}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={40} color={O.green} />
          </View>
          <Text style={s.successTitle}>Payment Released</Text>
          <Text style={s.successSub}>Your payment is protected and has been released</Text>
        </View>

        {/* Amount card */}
        <View style={s.amtCard}>
          <Text style={s.amtLabel}>Total Paid</Text>
          <Text style={s.amtValue}>${total.toFixed(2)}</Text>
        </View>

        {/* Details */}
        <View style={s.detailsCard}>
          {wo && (
            <>
              <Row label="Service" value={wo.service_type || 'General'} />
              <Row label="Contractor" value={wo.contractor_name} />
              {wo.booking?.job_address && <Row label="Location" value={wo.booking.job_address} />}
              {completedAt && <Row label="Completed" value={completedAt} />}
              <Row label="Order #" value={wo.work_order_number} mono />
            </>
          )}

          <View style={s.divider} />

          {subtotal > 0 && <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />}
          {tip > 0 && <Row label="Tip" value={`$${tip.toFixed(2)}`} accent={O.green} />}
          <Row label="Total" value={`$${total.toFixed(2)}`} bold />
        </View>

        {/* Payment note */}
        <View style={s.noteCard}>
          <Ionicons name="shield-checkmark-outline" size={16} color={O.green} />
          <Text style={s.noteTxt}>
            Payment was held securely and released only after your approval. You are never charged until you confirm the job is complete.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={s.bookAgainBtn}
          onPress={() => router.replace('/find-contractor' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Book again"
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={s.bookAgainTxt}>Book Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.homeBtn}
          onPress={() => router.replace('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={s.homeBtnTxt}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, mono, bold, accent }: {
  label: string; value: string; mono?: boolean; bold?: boolean; accent?: string;
}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, mono && s.rowMono, bold && s.rowBold, accent ? { color: accent } : null]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: O.bg },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: O.border },
  closeBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: O.txt },

  successBadge: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  successIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontSize: 22, fontWeight: '900', color: O.txt },
  successSub:   { fontSize: 14, color: O.txt2, textAlign: 'center', lineHeight: 20 },

  amtCard:      { backgroundColor: O.card, borderRadius: 16, borderWidth: 1, borderColor: O.border, padding: 24, alignItems: 'center', marginBottom: 12 },
  amtLabel:     { fontSize: 12, fontWeight: '700', color: O.txt2, letterSpacing: 0.5, marginBottom: 4 },
  amtValue:     { fontSize: 48, fontWeight: '900', color: O.green, letterSpacing: -1 },

  detailsCard:  { backgroundColor: O.card, borderRadius: 16, borderWidth: 1, borderColor: O.border, padding: 16, marginBottom: 12, gap: 2 },
  row:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, gap: 12 },
  rowLabel:     { fontSize: 13, color: O.txt2, flex: 1 },
  rowValue:     { fontSize: 13, color: O.txt, fontWeight: '600', textAlign: 'right', flex: 1 },
  rowMono:      { fontFamily: 'Inter_400Regular', fontSize: 11, color: O.txt3 },
  rowBold:      { fontWeight: '800', fontSize: 14 },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: O.border, marginVertical: 8 },

  noteCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.15)', padding: 14, marginBottom: 24 },
  noteTxt:      { flex: 1, fontSize: 12, color: O.txt2, lineHeight: 18 },

  bookAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: O.orange, borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  bookAgainTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  homeBtn:      { alignItems: 'center', paddingVertical: 14 },
  homeBtnTxt:   { fontSize: 14, color: O.txt2, fontWeight: '600' },
});
