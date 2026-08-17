// app/admin/disputes.tsx
// Admin queue: open / under-review disputes.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, StyleSheet,
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

interface DisputeRow {
  id: string;
  booking_id: string;
  customer_id: string;
  contractor_id: string | null;
  reason: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  booking: {
    trade: string | null;
    job_address: string | null;
    customer_name: string | null;
    contractor: { company_name: string | null } | null;
  } | null;
}

export default function AdminDisputesScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();

  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [resolveTarget, setResolveTarget] = useState<DisputeRow | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('disputes')
      .select('id, booking_id, customer_id, contractor_id, reason, status, admin_notes, created_at, booking:bookings(trade, job_address, customer_name, contractor:contractors(company_name))')
      .in('status', ['open', 'under_review'])
      .order('created_at', { ascending: true });
    setRows((data as any[]) ?? []);
    setLoading(false);
  }

  function openResolve(row: DisputeRow) {
    setResolutionText('');
    setResolveTarget(row);
  }

  async function submitResolve(finalStatus: 'resolved' | 'closed') {
    if (!resolveTarget) return;
    if (!resolutionText.trim()) {
      Alert.alert('Resolution required', 'Enter a note explaining the outcome.');
      return;
    }
    setBusyId(resolveTarget.id);
    try {
      const { error } = await supabase.rpc('admin_resolve_dispute', {
        p_dispute_id: resolveTarget.id,
        p_status: finalStatus,
        p_resolution: resolutionText.trim(),
      });
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== resolveTarget.id));
      setResolveTarget(null);
    } catch (e: any) {
      Alert.alert('Could not resolve', e.message ?? 'Try again.');
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
        <Text style={[s.title, { color: C.textPrimary }]}>Disputes</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={C.textMuted} />
          <Text style={{ fontSize: TY.base, color: C.textSecondary, marginTop: SP[3] }}>No open disputes</Text>
        </View>
      ) : (
        <View style={{ padding: SP[4], gap: SP[3] }}>
          {rows.map(row => {
            const busy = busyId === row.id;
            return (
              <View key={row.id} style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[2] }}>
                  <Text style={[s.name, { color: C.textPrimary }]}>{row.booking?.trade ?? 'Job'}</Text>
                  <View style={[s.statusPill, { backgroundColor: row.status === 'open' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)' }]}>
                    <Text style={{ fontSize: TY.xs, fontWeight: Font.bold, color: row.status === 'open' ? '#EF4444' : '#FBBF24' }}>
                      {row.status === 'open' ? 'Open' : 'Under Review'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: TY.xs, color: C.textSecondary, marginBottom: SP[3] }}>
                  {[row.booking?.customer_name, row.booking?.contractor?.company_name, row.booking?.job_address]
                    .filter(Boolean).join(' · ')}
                </Text>

                <View style={[s.reasonBox, { backgroundColor: C.background, borderColor: C.border }]}>
                  <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.semibold, marginBottom: 4 }}>REASON</Text>
                  <Text style={{ fontSize: TY.sm, color: C.textPrimary, lineHeight: 20 }}>{row.reason}</Text>
                </View>

                <Text style={{ fontSize: TY.xs, color: C.textMuted, marginTop: SP[2] }}>
                  Filed {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>

                <TouchableOpacity
                  style={[s.actionBtn, { marginTop: SP[3], backgroundColor: C.orange }]}
                  onPress={() => openResolve(row)}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#fff' }}>Resolve</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Resolution modal */}
      <Modal visible={!!resolveTarget} transparent animationType="fade" onRequestClose={() => setResolveTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.title, { color: C.textPrimary, marginBottom: SP[2] }]}>Resolve Dispute</Text>
            <Text style={{ fontSize: TY.sm, color: C.textSecondary, marginBottom: SP[3] }}>
              This note is saved as the dispute's resolution.
            </Text>
            <TextInput
              style={[s.reasonInput, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
              placeholder="What was the outcome?"
              placeholderTextColor={C.textMuted}
              value={resolutionText}
              onChangeText={setResolutionText}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[4] }}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.background, borderColor: C.border }]} onPress={() => setResolveTarget(null)}>
                <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: C.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.background, borderColor: C.border }]} onPress={() => submitResolve('closed')} disabled={busyId === resolveTarget?.id}>
                <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: C.textSecondary }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: '#22C55E' }]} onPress={() => submitResolve('resolved')} disabled={busyId === resolveTarget?.id}>
                {busyId === resolveTarget?.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#fff' }}>Mark Resolved</Text>
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
  statusPill:  { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  reasonBox:   { borderRadius: Radius.md, borderWidth: 0.5, padding: SP[3] },
  actionBtn:   { borderRadius: Radius.md, borderWidth: 0.5, paddingVertical: SP[3], alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[4] },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: SP[5] },
  modalSheet:  { width: '100%', borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[5] },
  reasonInput: { borderRadius: Radius.md, borderWidth: 0.5, padding: SP[3], fontSize: TY.sm, minHeight: 80, textAlignVertical: 'top' },
});
