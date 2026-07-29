import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, SectionList,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2 }).format(n);
}

function timeLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

function monthLabel(key: string) {
  const [yr, mo] = key.split('-').map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
}

interface PaymentRow {
  id: string;
  created_at: string;
  amount: number;
  contractor_payout: number;
  platform_fee: number;
  tip_amount: number;
  status: string;
  booking_id: string | null;
  booking?: { trade: string | null; customer_name: string | null } | null;
}

interface MonthSection {
  title: string;
  key: string;
  totalPayout: number;
  data: PaymentRow[];
}

const STATUS_COLOR: Record<string,string> = {
  released:  '#22C55E',
  held:      '#FBBF24',
  pending:   '#9090A8',
  refunded:  '#EF4444',
  failed:    '#EF4444',
};

export default function EarningsScreen() {
  const { colors: C } = useTheme();
  const router   = useRouter();
  const { user } = useAuth();

  const [sections,   setSections]   = useState<MonthSection[]>([]);
  const [summary,    setSummary]    = useState({ total: 0, pending: 0, count: 0 });
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!user) return;
    if (!quiet) setLoading(true);

    const { data } = await supabase
      .from('payments')
      .select(`
        id, created_at, amount, contractor_payout,
        platform_fee, tip_amount, status, booking_id,
        booking:bookings!booking_id(trade, customer_name)
      `)
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    const rows = (data ?? []) as unknown as PaymentRow[];

    // Aggregate
    let totalPayout = 0;
    let pendingAmt  = 0;
    for (const r of rows) {
      if (r.status === 'released') totalPayout += r.contractor_payout ?? 0;
      if (r.status === 'held' || r.status === 'pending') pendingAmt += r.contractor_payout ?? 0;
    }
    setSummary({ total: totalPayout, pending: pendingAmt, count: rows.length });

    // Group by month
    const map = new Map<string, PaymentRow[]>();
    for (const r of rows) {
      const key = monthKey(r.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    const built: MonthSection[] = [];
    for (const [key, items] of map.entries()) {
      const monthPayout = items.reduce((s, r) => s + (r.status === 'released' ? (r.contractor_payout ?? 0) : 0), 0);
      built.push({ title: monthLabel(key), key, totalPayout: monthPayout, data: items });
    }

    setSections(built);
    if (!quiet) setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const s = makeStyles(C);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Earnings History</Text>
        <View style={{ width: 40 }} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={C.orange}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}

        ListHeaderComponent={() => (
          <View style={s.summaryWrap}>
            {/* Total earned card */}
            <View style={[s.heroCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[s.heroLabel, { color: C.textMuted }]}>TOTAL EARNED</Text>
              <Text style={[s.heroAmount, { color: '#22C55E' }]}>{fmt(summary.total)}</Text>
              <Text style={[s.heroSub, { color: C.textMuted }]}>{summary.count} transactions</Text>
            </View>

            {/* Pending card */}
            {summary.pending > 0 && (
              <View style={[s.pendingCard, { backgroundColor: 'rgba(251,191,36,0.07)', borderColor: 'rgba(251,191,36,0.25)' }]}>
                <Ionicons name="time-outline" size={18} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingLabel}>Pending Release</Text>
                  <Text style={s.pendingAmt}>{fmt(summary.pending)}</Text>
                </View>
                <Text style={s.pendingNote}>Released after customer approval</Text>
              </View>
            )}

            {sections.length === 0 && (
              <View style={s.emptyState}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💸</Text>
                <Text style={[s.emptyTitle, { color: C.textPrimary }]}>No payments yet</Text>
                <Text style={[s.emptyText, { color: C.textMuted }]}>
                  Completed jobs will appear here with a full earnings breakdown.
                </Text>
              </View>
            )}
          </View>
        )}

        renderSectionHeader={({ section }) => (
          <View style={[s.sectionHeader, { backgroundColor: C.background }]}>
            <Text style={[s.sectionTitle, { color: C.textPrimary }]}>{section.title}</Text>
            <Text style={[s.sectionTotal, { color: '#22C55E' }]}>{fmt(section.totalPayout)}</Text>
          </View>
        )}

        renderItem={({ item }) => {
          const statusColor = STATUS_COLOR[item.status] ?? '#9090A8';
          const trade = (item.booking as any)?.trade ?? 'Job';
          const customer = (item.booking as any)?.customer_name ?? 'Customer';
          const hasTip = (item.tip_amount ?? 0) > 0;

          return (
            <TouchableOpacity
              style={[s.row, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => item.booking_id && router.push(`/job/${item.booking_id}` as any)}
              activeOpacity={0.75}
            >
              {/* Left accent bar */}
              <View style={[s.rowAccent, { backgroundColor: statusColor }]} />

              <View style={{ flex: 1, paddingLeft: 14 }}>
                <View style={s.rowTop}>
                  <Text style={[s.rowTrade, { color: C.textPrimary }]}>{trade}</Text>
                  <Text style={[s.rowPayout, { color: '#22C55E' }]}>{fmt(item.contractor_payout ?? 0)}</Text>
                </View>
                <Text style={[s.rowCustomer, { color: C.textSecondary }]}>{customer}</Text>
                <View style={s.rowMeta}>
                  <Text style={[s.rowDate, { color: C.textMuted }]}>{timeLabel(item.created_at)}</Text>
                  <View style={[s.statusPill, { backgroundColor: statusColor + '18' }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </Text>
                  </View>
                  {hasTip && (
                    <View style={s.tipPill}>
                      <Text style={s.tipText}>+{fmt(item.tip_amount)} tip</Text>
                    </View>
                  )}
                </View>

                {/* Fee breakdown */}
                <View style={[s.feeRow, { borderTopColor: C.border }]}>
                  <Text style={[s.feeItem, { color: C.textMuted }]}>
                    Job total: {fmt(item.amount ?? 0)}
                  </Text>
                  <Text style={[s.feeItem, { color: C.textMuted }]}>
                    Fee: -{fmt(item.platform_fee ?? 0)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: C.background },
    center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:       {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: SP[4], paddingVertical: SP[3],
      borderBottomWidth: 0.5, borderBottomColor: C.border,
    },
    backBtn:      {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle:  { fontSize: TY.md, fontWeight: Font.black, color: C.textPrimary },

    summaryWrap:  { paddingHorizontal: SP[4], paddingTop: SP[5], paddingBottom: SP[2] },
    heroCard:     {
      borderRadius: 20, borderWidth: 1, padding: SP[5],
      alignItems: 'center', marginBottom: SP[4],
    },
    heroLabel:    { fontSize: TY.xs, fontWeight: Font.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SP[2] },
    heroAmount:   { fontSize: 42, fontWeight: Font.black, letterSpacing: -1 },
    heroSub:      { fontSize: TY.sm, marginTop: SP[1] },

    pendingCard:  {
      flexDirection: 'row', alignItems: 'center', gap: SP[3],
      borderRadius: 16, borderWidth: 1, padding: SP[4], marginBottom: SP[4],
    },
    pendingLabel: { fontSize: TY.sm, fontWeight: Font.bold, color: '#FBBF24' },
    pendingAmt:   { fontSize: TY.md, fontWeight: Font.black, color: '#FBBF24', marginTop: 2 },
    pendingNote:  { fontSize: TY.xs, color: '#FBBF24', opacity: 0.7, textAlign: 'right', flex: 1 },

    emptyState:   { alignItems: 'center', paddingVertical: 48 },
    emptyTitle:   { fontSize: TY.lg, fontWeight: Font.black, marginBottom: SP[2] },
    emptyText:    { fontSize: TY.sm, textAlign: 'center', lineHeight: 22 },

    sectionHeader:{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: SP[4], paddingVertical: SP[3],
      borderBottomWidth: 0.5, borderBottomColor: C.border,
    },
    sectionTitle: { fontSize: TY.sm, fontWeight: Font.black, textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionTotal: { fontSize: TY.sm, fontWeight: Font.black },

    row: {
      flexDirection: 'row', marginHorizontal: SP[4], marginTop: SP[3],
      borderRadius: 16, borderWidth: 1, overflow: 'hidden',
      paddingVertical: SP[4], paddingRight: SP[4],
    },
    rowAccent:    { width: 4 },
    rowTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    rowTrade:     { fontSize: TY.base, fontWeight: Font.black },
    rowPayout:    { fontSize: TY.md, fontWeight: Font.black },
    rowCustomer:  { fontSize: TY.sm, marginBottom: SP[2] },
    rowMeta:      { flexDirection: 'row', alignItems: 'center', gap: SP[2], flexWrap: 'wrap' },
    rowDate:      { fontSize: TY.xs },
    statusPill:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    statusText:   { fontSize: TY.xs, fontWeight: Font.bold },
    tipPill:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.12)' },
    tipText:      { fontSize: TY.xs, fontWeight: Font.bold, color: '#22C55E' },
    feeRow:       { flexDirection: 'row', gap: SP[4], marginTop: SP[2], paddingTop: SP[2], borderTopWidth: 0.5 },
    feeItem:      { fontSize: TY.xs },
  });
}
