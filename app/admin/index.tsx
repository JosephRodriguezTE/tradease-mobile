// app/admin/index.tsx
// Admin dashboard hub — gated on users.is_admin. Redirects non-admins.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;

interface QueueCounts {
  verifications: number;
  disputes: number;
  refunds: number;
}

export default function AdminHomeScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [counts, setCounts] = useState<QueueCounts>({ verifications: 0, disputes: 0, refunds: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.replace('/(tabs)');
      return;
    }
    loadCounts();
  }, [adminLoading, isAdmin]);

  async function loadCounts() {
    setLoadingCounts(true);
    const [{ count: verifications }, { count: disputes }, { count: refunds }] = await Promise.all([
      supabase.from('contractor_verification').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
      supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setCounts({
      verifications: verifications ?? 0,
      disputes: disputes ?? 0,
      refunds: refunds ?? 0,
    });
    setLoadingCounts(false);
  }

  if (adminLoading || !isAdmin) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  const queues = [
    {
      id: 'verifications', icon: 'ribbon-outline', color: '#38BDF8',
      label: 'Pending Verifications', sub: 'Contractor license & insurance review',
      count: counts.verifications, route: '/admin/verifications',
    },
    {
      id: 'disputes', icon: 'alert-circle-outline', color: '#EF4444',
      label: 'Open Disputes', sub: 'Customer-reported job issues',
      count: counts.disputes, route: '/admin/disputes',
    },
    {
      id: 'refunds', icon: 'cash-outline', color: '#22C55E',
      label: 'Refund Requests', sub: 'Pending customer refund reviews',
      count: counts.refunds, route: '/admin/refunds',
    },
  ] as const;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.title, { color: C.textPrimary }]}>Admin</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ padding: SP[4], gap: SP[3] }}>
        {queues.map(q => (
          <TouchableOpacity
            key={q.id}
            style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push(q.route as any)}
            activeOpacity={0.85}
          >
            <View style={[s.iconBox, { backgroundColor: q.color + '18' }]}>
              <Ionicons name={q.icon as any} size={22} color={q.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardLabel, { color: C.textPrimary }]}>{q.label}</Text>
              <Text style={[s.cardSub, { color: C.textSecondary }]}>{q.sub}</Text>
            </View>
            {loadingCounts ? (
              <ActivityIndicator color={C.textMuted} size="small" />
            ) : q.count > 0 ? (
              <View style={[s.countPill, { backgroundColor: q.color }]}>
                <Text style={s.countText}>{q.count}</Text>
              </View>
            ) : (
              <Ionicons name="checkmark-circle-outline" size={20} color={C.textMuted} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: TY.md, fontWeight: Font.black },
  card:      { flexDirection: 'row', alignItems: 'center', gap: SP[3], borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4] },
  iconBox:   { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: TY.base, fontWeight: Font.bold },
  cardSub:   { fontSize: TY.xs, marginTop: 2 },
  countPill: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 13, fontWeight: Font.black, color: '#fff' },
});
