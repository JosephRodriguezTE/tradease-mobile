// app/admin/verifications.tsx
// Admin queue: pending contractor verification submissions.
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

interface VerificationRow {
  id: string;
  contractor_id: string;
  status: string;
  license_number: string | null;
  license_state: string | null;
  license_doc_path: string | null;
  insurance_provider: string | null;
  insurance_expiry: string | null;
  insurance_doc_path: string | null;
  id_doc_path: string | null;
  years_in_business: number | null;
  submitted_at: string | null;
  contractor: {
    company_name: string | null;
    trade_type: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
}

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();

  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openingDoc, setOpeningDoc] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<VerificationRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('contractor_verification')
      .select('id, contractor_id, status, license_number, license_state, license_doc_path, insurance_provider, insurance_expiry, insurance_doc_path, id_doc_path, years_in_business, submitted_at, contractor:contractors(company_name, trade_type, phone, avatar_url)')
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: true });
    setRows((data as any[]) ?? []);
    setLoading(false);
  }

  async function viewDoc(path: string | null) {
    if (!path) return;
    setOpeningDoc(true);
    try {
      const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error('No URL');
      await Linking.openURL(data.signedUrl);
    } catch (e: any) {
      Alert.alert('Could not open document', e.message ?? 'Try again.');
    } finally {
      setOpeningDoc(false);
    }
  }

  async function approve(row: VerificationRow) {
    setBusyId(row.id);
    try {
      const { error } = await supabase.rpc('admin_review_verification', {
        p_contractor_id: row.contractor_id,
        p_approve: true,
        p_reason: null,
      });
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e: any) {
      Alert.alert('Approve failed', e.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(row: VerificationRow) {
    Alert.alert(
      'Approve Contractor',
      `Approve ${row.contractor?.company_name ?? 'this contractor'}? They'll get the Verified badge immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => approve(row) },
      ],
    );
  }

  function openReject(row: VerificationRow) {
    setRejectReason('');
    setRejectTarget(row);
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a reason so the contractor knows what to fix.');
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      const { error } = await supabase.rpc('admin_review_verification', {
        p_contractor_id: rejectTarget.contractor_id,
        p_approve: false,
        p_reason: rejectReason.trim(),
      });
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== rejectTarget.id));
      setRejectTarget(null);
    } catch (e: any) {
      Alert.alert('Reject failed', e.message ?? 'Try again.');
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
        <Text style={[s.title, { color: C.textPrimary }]}>Verifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={C.textMuted} />
          <Text style={{ fontSize: TY.base, color: C.textSecondary, marginTop: SP[3] }}>No pending verifications</Text>
        </View>
      ) : (
        <View style={{ padding: SP[4], gap: SP[3] }}>
          {rows.map(row => {
            const busy = busyId === row.id;
            return (
              <View key={row.id} style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP[3], marginBottom: SP[3] }}>
                  <View style={[s.avatar, { backgroundColor: C.orange }]}>
                    <Text style={s.avatarTxt}>{(row.contractor?.company_name ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, { color: C.textPrimary }]}>{row.contractor?.company_name ?? 'Unknown'}</Text>
                    <Text style={{ fontSize: TY.xs, color: C.textSecondary }}>
                      {row.contractor?.trade_type ?? '—'}{row.contractor?.phone ? ` · ${row.contractor.phone}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={[s.infoGrid, { borderColor: C.border }]}>
                  <InfoRow C={C} label="License" value={row.license_number ? `${row.license_number} (${row.license_state ?? '—'})` : '—'} />
                  <InfoRow C={C} label="Insurance" value={row.insurance_provider ? `${row.insurance_provider} · exp. ${row.insurance_expiry ?? '—'}` : '—'} />
                  <InfoRow C={C} label="Experience" value={row.years_in_business != null ? `${row.years_in_business} yrs` : '—'} />
                  <InfoRow C={C} label="Submitted" value={row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} last />
                </View>

                <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[3] }}>
                  <DocBtn C={C} label="License" disabled={!row.license_doc_path || openingDoc} onPress={() => viewDoc(row.license_doc_path)} />
                  <DocBtn C={C} label="Insurance" disabled={!row.insurance_doc_path || openingDoc} onPress={() => viewDoc(row.insurance_doc_path)} />
                  <DocBtn C={C} label="Gov ID" disabled={!row.id_doc_path || openingDoc} onPress={() => viewDoc(row.id_doc_path)} />
                </View>

                <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[3] }}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}
                    onPress={() => openReject(row)}
                    disabled={busy}
                  >
                    <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#EF4444' }}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { flex: 1, backgroundColor: '#22C55E' }]}
                    onPress={() => confirmApprove(row)}
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

      {/* Reject reason modal */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.title, { color: C.textPrimary, marginBottom: SP[2] }]}>Reject Verification</Text>
            <Text style={{ fontSize: TY.sm, color: C.textSecondary, marginBottom: SP[3] }}>
              This reason is shown to the contractor.
            </Text>
            <TextInput
              style={[s.reasonInput, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
              placeholder="e.g. License document is expired"
              placeholderTextColor={C.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: SP[2], marginTop: SP[4] }}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.background, borderColor: C.border }]} onPress={() => setRejectTarget(null)}>
                <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: C.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: '#EF4444' }]} onPress={submitReject} disabled={busyId === rejectTarget?.id}>
                {busyId === rejectTarget?.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#fff' }}>Confirm Reject</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ C, label, value, last }: { C: any; label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.infoRow, !last && { borderBottomWidth: 0.5, borderBottomColor: C.border }]}>
      <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.semibold }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: TY.sm, color: C.textPrimary }}>{value}</Text>
    </View>
  );
}

function DocBtn({ C, label, onPress, disabled }: { C: any; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.docBtn, { borderColor: C.border, backgroundColor: C.background, opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name="document-text-outline" size={14} color={C.textSecondary} />
      <Text style={{ fontSize: TY.xs, fontWeight: Font.semibold, color: C.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: TY.md, fontWeight: Font.black },
  card:        { borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4] },
  avatar:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { fontSize: TY.base, fontWeight: Font.black, color: '#fff' },
  name:        { fontSize: TY.base, fontWeight: Font.bold },
  infoGrid:    { borderRadius: Radius.md, borderWidth: 0.5, overflow: 'hidden' },
  infoRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[3], paddingVertical: SP[2] },
  docBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.sm, borderWidth: 0.5, paddingVertical: SP[2] },
  actionBtn:   { borderRadius: Radius.md, borderWidth: 0.5, paddingVertical: SP[3], alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[4] },
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: SP[5] },
  modalSheet:  { width: '100%', borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[5] },
  reasonInput: { borderRadius: Radius.md, borderWidth: 0.5, padding: SP[3], fontSize: TY.sm, minHeight: 80, textAlignVertical: 'top' },
});
