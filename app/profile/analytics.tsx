import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;
const BAR_TRACK_H = 80;

interface MonthBucket { label: string; revenue: number }

interface Stats {
  plan: string;
  total: number;
  completed: number;
  inProgress: number;
  cancelled: number;
  revenue: number;
  avgJobValue: number;
  thisMonthEarnings: number;
  lastMonthEarnings: number;
  topTrade: string | null;
  rating: number;
  reviewCount: number;
  repeatCustomers: number;
  monthlyRevenue: MonthBucket[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string;
}) {
  const { colors: C } = useTheme();
  return (
    <View style={[sc.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[sc.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[sc.statValue, { color: C.textPrimary }]}>{value}</Text>
      <Text style={[sc.statLabel, { color: C.textMuted }]}>{label}</Text>
      {!!sub && <Text style={[sc.statSub, { color }]}>{sub}</Text>}
    </View>
  );
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={{ fontSize: 20, color: i <= full || (i === full + 1 && half) ? '#FBBF24' : '#333' }}>
          {i <= full ? '★' : (i === full + 1 && half) ? '⭑' : '☆'}
        </Text>
      ))}
    </View>
  );
}

const sc = StyleSheet.create({
  statCard:  { flex: 1, minWidth: '45%', borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4], gap: SP[2], alignItems: 'center' },
  statIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SP[1] },
  statValue: { fontSize: TY.xl, fontWeight: Font.black },
  statLabel: { fontSize: TY.xs, fontWeight: Font.semibold, textAlign: 'center' },
  statSub:   { fontSize: TY.xs, fontWeight: Font.bold },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();

  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: contractor }, { data: bookings }] = await Promise.all([
      supabase.from('contractors').select('plan, rating, review_count').eq('id', user.id).single(),
      supabase.from('bookings').select('status, price_estimate, customer_id, created_at, trade').eq('contractor_id', user.id),
    ]);

    const all       = bookings ?? [];
    const completed = all.filter(b => ['completed', 'approved', 'paid'].includes(b.status));
    const paidJobs  = all.filter(b => ['approved', 'paid'].includes(b.status));
    const revenue   = paidJobs.reduce((sum, b) => sum + (b.price_estimate ?? 0), 0);
    const avgJobValue = completed.length > 0 ? revenue / completed.length : 0;

    const customerIds  = completed.map(b => b.customer_id).filter(Boolean);
    const repeatIds    = customerIds.filter(id => customerIds.indexOf(id) !== customerIds.lastIndexOf(id));
    const repeatUnique = new Set(repeatIds).size;

    const tradeCounts: Record<string, number> = {};
    all.forEach(b => { if (b.trade) tradeCounts[b.trade] = (tradeCounts[b.trade] ?? 0) + 1; });
    const topTrade = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Last 6 months buckets for bar chart
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const thisMonthEarnings = paidJobs
      .filter(b => b.created_at >= thisMonthStart)
      .reduce((sum, b) => sum + (b.price_estimate ?? 0), 0);
    const lastMonthEarnings = paidJobs
      .filter(b => b.created_at >= lastMonthStart && b.created_at < thisMonthStart)
      .reduce((sum, b) => sum + (b.price_estimate ?? 0), 0);
    const monthlyRevenue: MonthBucket[] = Array.from({ length: 6 }, (_, i) => {
      const d     = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const rev   = completed
        .filter(b => {
          const bd = new Date(b.created_at);
          return bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth();
        })
        .reduce((s, b) => s + (b.price_estimate ?? 0), 0);
      return { label, revenue: rev };
    });

    setStats({
      plan:               contractor?.plan ?? 'free',
      total:              all.length,
      completed:          completed.length,
      inProgress:         all.filter(b => b.status === 'in_progress').length,
      cancelled:          all.filter(b => b.status === 'cancelled').length,
      revenue,
      avgJobValue,
      thisMonthEarnings,
      lastMonthEarnings,
      topTrade,
      rating:             contractor?.rating ?? 0,
      reviewCount:        contractor?.review_count ?? 0,
      repeatCustomers:    repeatUnique,
      monthlyRevenue,
    });
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const Header = () => (
    <View style={[s.header, { borderBottomColor: C.border }]}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
        <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: C.textPrimary }]}>Analytics</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
        <Header />
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  // ── Free plan gate ────────────────────────────────────────────────────────
  if (stats?.plan === 'free') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
        <Header />
        <ScrollView contentContainerStyle={s.wallScroll} showsVerticalScrollIndicator={false}>
          <View style={[s.upgradeWall, { backgroundColor: C.surface, borderColor: C.border }]}>

            <View style={[s.upgradeWallIconBox, { backgroundColor: 'rgba(255,98,0,0.12)' }]}>
              <Ionicons name="bar-chart-outline" size={36} color={C.orange} />
            </View>

            <Text style={[s.upgradeWallTitle, { color: C.textPrimary }]}>Analytics Dashboard</Text>
            <Text style={[s.upgradeWallSub, { color: C.textSecondary }]}>
              Track your performance, revenue, and reputation. Available on Leads and Pro plans.
            </Text>

            <View style={[s.upgradeWallFeatures, { borderColor: C.border }]}>
              {[
                { text: 'Total jobs, completion rate',             icon: 'briefcase-outline'         },
                { text: 'Revenue tracking from completed jobs',    icon: 'cash-outline'              },
                { text: 'Star rating & review count',              icon: 'star-outline'              },
                { text: 'Repeat customer insights (Pro)',          icon: 'people-outline'            },
                { text: '6-month revenue bar chart (Pro)',         icon: 'trending-up-outline'       },
              ].map((f, i) => (
                <View key={i} style={s.upgradeWallFeatureRow}>
                  <Ionicons name={f.icon as any} size={15} color={C.orange} />
                  <Text style={[s.upgradeWallFeatureText, { color: C.textSecondary }]}>{f.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.upgradeWallBtn, { backgroundColor: C.orange }]}
              onPress={() => router.push('/profile/subscription' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={s.upgradeWallBtnText}>Upgrade to Leads</Text>
            </TouchableOpacity>

            <Text style={[s.upgradeWallNote, { color: C.textMuted }]}>Starting at $5/month · Cancel anytime</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Leads / Pro analytics ─────────────────────────────────────────────────
  const isPro = stats?.plan === 'pro';
  const completionRate = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;
  const maxMonthRev = Math.max(...(stats?.monthlyRevenue.map(m => m.revenue) ?? []), 1);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: C.background }]} edges={['top']}>
      <Header />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.orange}
          />
        }
      >

        {/* Plan badge */}
        <View style={[s.planRow, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name={isPro ? 'trophy' : 'flash'} size={14} color={isPro ? '#FF6200' : '#38BDF8'} />
          <Text style={[s.planText, { color: isPro ? '#FF6200' : '#38BDF8' }]}>
            {isPro ? 'Pro Subscription' : 'Just Leads'} — {isPro ? 'Full Analytics' : 'Analytics'}
          </Text>
        </View>

        {/* Overview */}
        <Text style={[s.sectionTitle, { color: C.textMuted }]}>OVERVIEW</Text>
        <View style={s.grid}>
          <StatCard label="Total Jobs"  value={String(stats?.total ?? 0)}     color="#38BDF8" icon="briefcase-outline" />
          <StatCard label="Completed"   value={String(stats?.completed ?? 0)} sub={`${completionRate}% rate`} color="#22C55E" icon="checkmark-circle-outline" />
          <StatCard label="In Progress" value={String(stats?.inProgress ?? 0)} color="#FBBF24" icon="time-outline" />
          <StatCard label="Cancelled"   value={String(stats?.cancelled ?? 0)} color="#EF4444" icon="close-circle-outline" />
        </View>

        {/* Revenue */}
        <Text style={[s.sectionTitle, { color: C.textMuted }]}>REVENUE</Text>
        <View style={{ position: 'relative', marginBottom: SP[3] }}>
          <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border, marginBottom: 0 }]}>
            <View style={[s.infoIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <Ionicons name="cash-outline" size={22} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.revenueValue, { color: '#22C55E' }]}>
                {isPro
                  ? `$${stats?.revenue?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '0'}`
                  : '$•••••'}
              </Text>
              <Text style={[s.infoSub, { color: C.textSecondary }]}>
                From {stats?.completed ?? 0} completed job{stats?.completed !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          {!isPro && (
            <View style={s.lockOverlay}>
              <View style={[s.lockChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Ionicons name="lock-closed" size={14} color={C.orange} />
                <Text style={[s.lockChipText, { color: C.textPrimary }]}>Pro only</Text>
              </View>
            </View>
          )}
        </View>

        {/* Avg Job Value + Completion Rate */}
        <View style={[s.grid, { marginBottom: SP[2] }]}>
          <View style={{ flex: 1, position: 'relative' }}>
            <StatCard
              label="Avg Job Value"
              value={isPro ? `$${Math.round(stats?.avgJobValue ?? 0).toLocaleString('en-US')}` : '$•••'}
              color="#A78BFA"
              icon="trending-up-outline"
            />
            {!isPro && (
              <View style={[s.lockOverlay, { borderRadius: Radius.lg }]}>
                <Ionicons name="lock-closed" size={16} color={C.orange} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <StatCard
              label="Completion Rate"
              value={`${completionRate}%`}
              sub={completionRate >= 80 ? 'Excellent' : completionRate >= 60 ? 'Good' : 'Needs work'}
              color={completionRate >= 80 ? '#22C55E' : completionRate >= 60 ? '#FBBF24' : '#EF4444'}
              icon="checkmark-circle-outline"
            />
          </View>
        </View>

        {!isPro && (
          <TouchableOpacity
            style={[s.proGateBanner, { backgroundColor: 'rgba(255,98,0,0.06)', borderColor: 'rgba(255,98,0,0.25)' }]}
            onPress={() => router.push('/profile/subscription' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="lock-closed" size={14} color={C.orange} />
            <Text style={[s.proGateBannerText, { color: C.textSecondary }]}>Upgrade to Pro to unlock earnings analytics</Text>
            <Ionicons name="chevron-forward" size={13} color={C.orange} />
          </TouchableOpacity>
        )}

        {/* Rating */}
        <Text style={[s.sectionTitle, { color: C.textMuted }]}>REPUTATION</Text>
        <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[s.infoIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
            <Ionicons name="star-outline" size={22} color="#FBBF24" />
          </View>
          <View style={{ flex: 1, gap: SP[1] }}>
            {stats && stats.rating > 0 ? (
              <>
                <StarRow rating={stats.rating} />
                <Text style={[s.infoSub, { color: C.textSecondary }]}>
                  {stats.rating.toFixed(1)} average · {stats.reviewCount} review{stats.reviewCount !== 1 ? 's' : ''}
                </Text>
              </>
            ) : (
              <Text style={[s.infoSub, { color: C.textMuted }]}>No reviews yet</Text>
            )}
          </View>
        </View>

        {/* Pro extras */}
        {isPro && (
          <>
            <Text style={[s.sectionTitle, { color: C.textMuted }]}>THIS MONTH</Text>
            <View style={[s.infoCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={[s.infoIcon, { backgroundColor: 'rgba(255,98,0,0.12)' }]}>
                <Ionicons name="calendar-outline" size={22} color={C.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.revenueValue, { color: C.orange }]}>
                  ${(stats?.thisMonthEarnings ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Text>
                <Text style={[s.infoSub, { color: C.textSecondary }]}>
                  {stats && stats.lastMonthEarnings > 0
                    ? stats.thisMonthEarnings >= stats.lastMonthEarnings
                      ? `↑ ${Math.round(((stats.thisMonthEarnings - stats.lastMonthEarnings) / stats.lastMonthEarnings) * 100)}% vs last month`
                      : `↓ ${Math.round(((stats.lastMonthEarnings - stats.thisMonthEarnings) / stats.lastMonthEarnings) * 100)}% vs last month`
                    : 'No data from last month to compare'}
                </Text>
              </View>
            </View>

            <View style={s.grid}>
              <StatCard
                label="Repeat Customers"
                value={String(stats?.repeatCustomers ?? 0)}
                color="#34D399"
                icon="people-outline"
              />
              <StatCard
                label={stats?.topTrade ? 'Top Trade' : 'Completion Rate'}
                value={stats?.topTrade ?? `${completionRate}%`}
                sub={!stats?.topTrade
                  ? (completionRate >= 80 ? 'Excellent' : completionRate >= 60 ? 'Good' : 'Needs work')
                  : undefined}
                color={stats?.topTrade ? C.orange : (completionRate >= 80 ? '#22C55E' : completionRate >= 60 ? '#FBBF24' : '#EF4444')}
                icon={stats?.topTrade ? 'construct-outline' : 'trending-up-outline'}
              />
            </View>
          </>
        )}

        {/* Pro bar chart — last 6 months */}
        {isPro && stats && (
          <>
            <Text style={[s.sectionTitle, { color: C.textMuted }]}>MONTHLY REVENUE</Text>
            <View style={[s.chartCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={s.barChart}>
                {stats.monthlyRevenue.map((m, i) => {
                  const barH = maxMonthRev > 0
                    ? Math.round((m.revenue / maxMonthRev) * BAR_TRACK_H)
                    : 0;
                  return (
                    <View key={i} style={s.barCol}>
                      <Text style={[s.barValue, { color: C.textMuted }]}>
                        {m.revenue > 0
                          ? `$${m.revenue >= 1000 ? `${Math.round(m.revenue / 1000)}k` : m.revenue}`
                          : ' '}
                      </Text>
                      <View style={[s.barTrack, { backgroundColor: C.border }]}>
                        <View
                          style={[
                            s.barFill,
                            {
                              height: Math.max(barH, m.revenue > 0 ? 4 : 0),
                              backgroundColor: C.orange,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.barLabel, { color: C.textMuted }]}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* Leads — upgrade nudge to pro */}
        {!isPro && (
          <View style={[s.upgradePrompt, { backgroundColor: 'rgba(255,98,0,0.06)', borderColor: 'rgba(255,98,0,0.25)' }]}>
            <Ionicons name="trophy" size={20} color={C.orange} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[s.upgradePromptTitle, { color: C.textPrimary }]}>Unlock Full Analytics</Text>
              <Text style={[s.upgradePromptSub, { color: C.textSecondary }]}>
                Pro adds repeat customer tracking, 6-month revenue chart, and more.
              </Text>
            </View>
            <TouchableOpacity
              style={[s.upgradePromptBtn, { backgroundColor: C.orange }]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Text style={s.upgradePromptBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: SP[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: TY.md, fontWeight: Font.black, letterSpacing: -0.3 },

  scroll:     { paddingHorizontal: SP[4], paddingTop: SP[4] },
  wallScroll: { flexGrow: 1, paddingHorizontal: SP[4], paddingTop: SP[6], paddingBottom: SP[10] },

  planRow:  { flexDirection: 'row', alignItems: 'center', gap: SP[2], borderRadius: Radius.md, borderWidth: 0.5, paddingHorizontal: SP[3], paddingVertical: SP[2], alignSelf: 'flex-start', marginBottom: SP[5] },
  planText: { fontSize: TY.xs, fontWeight: Font.black },

  sectionTitle: { fontSize: TY.xs, fontWeight: Font.black, letterSpacing: 0.8, marginBottom: SP[3], marginTop: SP[2] },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: SP[3], marginBottom: SP[5] },

  infoCard:    { flexDirection: 'row', alignItems: 'center', gap: SP[3], borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4], marginBottom: SP[5] },
  infoIcon:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  revenueValue:{ fontSize: TY.xl, fontWeight: Font.black },
  infoSub:     { fontSize: TY.sm, marginTop: 2 },

  chipBtn:     { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  chipBtnText: { fontSize: TY.xs, fontWeight: Font.black },

  chartCard: { borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4], marginBottom: SP[5] },
  barChart:  { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol:    { flex: 1, alignItems: 'center', gap: SP[1] },
  barTrack:  { width: '100%', height: BAR_TRACK_H, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  barFill:   { width: '100%', borderRadius: 4 },
  barValue:  { fontSize: 9, fontWeight: Font.bold, textAlign: 'center' },
  barLabel:  { fontSize: TY.xs, fontWeight: Font.semibold, textAlign: 'center' },

  upgradePrompt:       { flexDirection: 'row', alignItems: 'center', gap: SP[3], borderRadius: Radius.lg, borderWidth: 1, padding: SP[4], marginTop: SP[2], marginBottom: SP[4] },
  upgradePromptTitle:  { fontSize: TY.base, fontWeight: Font.black },
  upgradePromptSub:    { fontSize: TY.xs, lineHeight: 17 },
  upgradePromptBtn:    { borderRadius: Radius.md, paddingHorizontal: SP[3], paddingVertical: SP[2] },
  upgradePromptBtnText:{ fontSize: TY.xs, fontWeight: Font.black, color: '#fff' },

  // Free upgrade wall
  upgradeWall:            { borderRadius: Radius.xl, borderWidth: 1, padding: SP[6], alignItems: 'center', gap: SP[4] },
  upgradeWallIconBox:     { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  upgradeWallTitle:       { fontSize: TY.lg, fontWeight: Font.black, letterSpacing: -0.3 },
  upgradeWallSub:         { fontSize: TY.sm, textAlign: 'center', lineHeight: 20 },
  upgradeWallFeatures:    { width: '100%', borderTopWidth: 0.5, borderBottomWidth: 0.5, paddingVertical: SP[4], gap: SP[3] },
  upgradeWallFeatureRow:  { flexDirection: 'row', alignItems: 'center', gap: SP[2] },
  upgradeWallFeatureText: { fontSize: TY.sm, flex: 1 },
  upgradeWallBtn:         { flexDirection: 'row', alignItems: 'center', gap: SP[2], borderRadius: Radius.lg, paddingVertical: SP[3], paddingHorizontal: SP[6] },
  upgradeWallBtnText:     { fontSize: TY.base, fontWeight: Font.black, color: '#fff' },
  upgradeWallNote:        { fontSize: TY.xs },

  lockOverlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,15,0.80)', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  lockChip:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  lockChipText:      { fontSize: TY.xs, fontWeight: Font.black },
  proGateBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: SP[4], paddingVertical: SP[3], marginBottom: SP[5] },
  proGateBannerText: { flex: 1, fontSize: TY.xs, fontWeight: Font.semibold },
});
