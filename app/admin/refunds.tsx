// app/admin/refunds.tsx
// Admin queue: pending refund requests.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;

interface RefundRow {
  id: string;
  booking_id: string;
  customer_id: string;
  reason: string;
  amount_paid: number | null;
  amount_requested: number | null;
  status: string;
  evidence_url: string | null;
  created_at: string;
  booking: {
    trade: string | null;
    job_address: string | null;
    customer_name: string | null;
  } | null;
}

function fmt(n: number | null) {
  return n != null ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—';
}

export default function AdminRefundsScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();

  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [processTarget, setProcessTarget] = useState<RefundRow | null>(null);
  const [amountText, setAmountText] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('refund_requests')
      .select('id, booking_id, customer_id, reason, amount_paid, amount_requested, status, evidence_url, created_at, booking:bookings(trade, job_address, customer_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setRows((data as any[]) ?? []);
    setLoading(false);
  }

  function openProcess(row: RefundRow) {
    setAmountText(row.amount_requested != null ? String(row.amount_requested) : '');
    setProcessTarget(row);
  }

  async function deny(row: RefundRow) {
    setBusyId(row.id);
    try {
      const { error } = await supabase.rpc('admin_process_refund', {
        p_refund_id: row.id,
        p_status: 'denied',
        p_amount_approved: null,
      });
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== row.id));
      setProcessTarget(null);
    } catch (e: any) {
      Alert.alert('Could not deny', e.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function approve() {
    if (!processTarget) return;
    const amount = parseFloat(amountText);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid approved amount.');
      return;
    }
    setBusyId(processTarget.id);
    try {
      const { error } = await supabase.rpc('admin_process_refund', {
        p_refund_id: processTarget.id,
        p_status: 'approved',
        p_amount_approved: amount,
      });
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== processTarget.id));
      setProcessTarget(null);
    } catch (e: any) {
      Alert.alert('Could not approve', e.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/admin' as any)} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: C.textPrimary }]}>Refund Requests</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={C.textMuted} />
          <Text style={{ fontSize: TY.base, color: C.textSecondary, marginTop: SP[3] }}>No pending refund requests</Text>
        </View>
      ) : (
        <View style={{ padding: SP[4], gap: SP[3] }}>
          {rows.map(row => {
            const busy = busyId === row.id;
            return (
              <View key={row.id} style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[2] }}>
                  <Text style={[s.name, { color: C.textPrimary }]}>{row.booking?.trade ?? 'Job'}</Text>
                  <Text style={{ fontSize: TY.base, fontWeight: Font.black, color: '#22C55E' }}>{fmt(row.amount_requested)}</Text>
                </View>

                <Text style={{ fontSize: TY.xs, color: C.textSecondary, marginBottom: SP[3] }}>
                  {[row.booking?.customer_name, row.booking?.job_address].filter(Boolean).join(' · ')}
                  {row.amount_paid != null ? ` · paid ${fmt(row.amount_paid)}` : ''}
                </Text>

                <View style={[s.reasonBox, { backgroundColor: C.background, borderColor: C.border }]}>
                  <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.semibold, marginBottom: 4 }}>REASON</Text>
                  <Text style={{ fontSize: TY.sm, color: C.textPrimary, lineHeight: 20 }}>{row.reason}</Text>
                </View>

                {row.evidence_url && (
                  <TouchableOpacity onPress={() => Linking.openURL(row.evidence_url!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SP[2] }}>
                    <Ionicons name="attach-outline" size={14} color={C.orange} />
                    <Text style={{ fontSize: TY.xs, color: C.orange, fontWeight: Font.semibold }}>View evidence</Text>
                  </TouchableOpacity>
                )}

                <Text style={{ fontSize: TY.xs, color: C.textMuted, marginTop: SP[2] }}>
                  Requested {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>

                <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[3] }}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}
                    onPress={() => deny(row)}
                    disabled={busy}
                  >
                    <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#EF4444' }}>Deny</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1, backgroundColor: '#22C55E' }]}
                    onPress={() => openProcess(row)}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#fff' }}>Approve</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Approve-amount modal */}
      <Modal visible={!!processTarget} transparent animationType="fade" onRequestClose={() => setProcessTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.title, { color: C.textPrimary, marginBottom: SP[2] }]}>Approve Refund</Text>
            <Text style={{ fontSize: TY.sm, color: C.textSecondary, marginBottom: SP[3] }}>
              Customer requested {fmt(processTarget?.amount_requested ?? null)}. Adjust if needed.
            </Text>
            <TextInput
              style={[s.amountInput, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
              placeholder="0.00"
              placeholderTextColor={C.textMuted}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
            />
            <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[4] }}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.background, borderColor: C.border }]} onPress={() => setProcessTarget(null)}>
                <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: C.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: '#22C55E' }]} onPress={approve} disabled={busyId === processTarget?.id}>
                {busyId === processTarget?.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#fff' }}>Confirm Approve</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: TY.md, fontWeight: Font.black },
  card:        { borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4] },
  name:        { fontSize: TY.base, fontWeight: Font.bold },
  reasonBox:   { borderRadius: Radius.md, borderWidth: 0.5, padding: SP[3] },
  actionBtn:   { borderRadius: Radius.md, borderWidth: 0.5, paddingVertical: SP[3], alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[4] },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: SP[5] },
  modalSheet:  { width: '100%', borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[5] },
  amountInput: { borderRadius: Radius.md, borderWidth: 0.5, padding: SP[3], fontSize: TY.lg, fontWeight: Font.bold },
});
