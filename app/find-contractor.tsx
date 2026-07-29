import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../constants/Layout';
import { Colors, Font, Radius } from '../constants/theme';
import { ALL_TRADE_SPECIALTIES, ALL_TRADES, POPULAR_SEARCHES, TRADE_ICONS } from '../lib/tradeJobs';
import { supabase } from '../lib/supabase';


const PLAN_META: Record<string, { label: string; color: string }> = {
  free:  { label: 'FREE',  color: '#9A9A9A' },
  leads: { label: 'LEADS', color: '#FF6200' },
  pro:   { label: 'PRO',   color: '#FBBF24' },
};

// ─── CompanyCard ─────────────────────────────────────────────────────────────
// Same card the contractor sees — with optional glow treatment and message btn

function CompanyCard({ contractor, showGlow, onMessage }: {
  contractor: any;
  showGlow?: boolean;
  onMessage?: () => void;
}) {
  const router    = useRouter();
  const { colors: C } = useTheme();

  const avatarUrl   = contractor?.avatar_url?.trim() || null;
  const displayName = contractor?.company_name ?? 'Contractor';
  const initials    = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const planMeta    = PLAN_META[contractor?.plan ?? 'free'] ?? PLAN_META.free;
  const isVerified  = contractor?.verification_status === 'approved' || contractor?.verified;
  const isTrusted   = !!(
    contractor?.company_name?.trim() &&
    contractor?.phone?.trim() &&
    contractor?.location?.trim() &&
    contractor?.avatar_url?.trim() &&
    contractor?.username?.trim()
  );
  const specs: string[] = contractor?.specializations ?? [];

  return (
    <View style={[
      { borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 16, gap: 12 },
      showGlow && {
        borderColor: '#FF6200',
        borderWidth: 1.5,
        shadowColor: '#FF6200',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
        elevation: 8,
      },
    ]}>

      {/* Featured Pro label — first session only */}
      {showGlow && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,98,0,0.10)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: -4 }}>
          <Ionicons name="star" size={11} color="#FF6200" />
          <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#FF6200', letterSpacing: 0.6 }}>FEATURED</Text>
        </View>
      )}

      {/* Top row: avatar + name + badges + rating */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,98,0,0.13)', borderWidth: 1.5, borderColor: 'rgba(255,98,0,0.3)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {avatarUrl ? (
            <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden' }}>
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
          ) : (
            <Text style={{ fontSize: 18, fontWeight: Font.black, color: '#FF6200' }}>{initials}</Text>
          )}
          {isTrusted && (
            <View style={{ position: 'absolute', bottom: -4, left: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.background }}>
              <Ionicons name="shield-checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: Font.black, color: C.textPrimary, letterSpacing: -0.3 }} numberOfLines={1}>{displayName}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: planMeta.color + '18', borderColor: planMeta.color + '40' }}>
              <Text style={{ fontSize: 10, fontWeight: Font.black, color: planMeta.color }}>{planMeta.label}</Text>
            </View>
            {isVerified && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }}>
                <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
                <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#22C55E' }}>VERIFIED</Text>
              </View>
            )}
            {contractor?.is_available && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#22C55E' }} />
                <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#22C55E' }}>ONLINE</Text>
              </View>
            )}
          </View>
        </View>

        {!!contractor?.rating && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.orangeDim, borderWidth: 0.5, borderColor: C.orange }}>
            <Ionicons name="star" size={12} color={C.orange} />
            <Text style={{ fontSize: 13, fontWeight: Font.black, color: C.orange }}>{Number(contractor.rating).toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Meta row */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {!!contractor?.trade_type && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="construct-outline" size={13} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.trade_type}</Text>
          </View>
        )}
        {!!contractor?.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="location-outline" size={13} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.location}</Text>
          </View>
        )}
        {contractor?.review_count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="chatbubble-outline" size={12} color={C.textMuted} />
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{contractor.review_count} reviews</Text>
          </View>
        )}
      </View>

      {/* Tagline / description */}
      {!!(contractor?.tagline || contractor?.description) && (
        <Text style={{ fontSize: 13, lineHeight: 20, color: C.textSecondary, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 12 }} numberOfLines={3}>
          {contractor.tagline ?? contractor.description}
        </Text>
      )}

      {/* Trust badges */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { icon: 'shield-checkmark-outline', label: 'Verified', active: contractor?.verified ?? false,          activeColor: '#22C55E' },
          { icon: 'umbrella-outline',          label: 'Insured',  active: contractor?.insured ?? false,           activeColor: '#38BDF8' },
          { icon: 'document-text-outline',     label: 'Licensed', active: contractor?.license_verified ?? false,  activeColor: '#A78BFA' },
        ].map(t => (
          <View key={t.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, borderWidth: 1, paddingVertical: 8, backgroundColor: t.active ? t.activeColor + '10' : C.background, borderColor: t.active ? t.activeColor + '40' : C.border }}>
            <Ionicons name={t.icon as any} size={13} color={t.active ? t.activeColor : C.textMuted} />
            <Text style={{ fontSize: 10, fontWeight: Font.bold, color: t.active ? t.activeColor : C.textMuted }}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* Specializations */}
      {specs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {specs.slice(0, 5).map((spec: string) => (
            <View key={spec} style={{ borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.background, borderColor: C.border }}>
              <Text style={{ fontSize: 11, fontWeight: Font.semibold, color: C.textSecondary }}>{spec}</Text>
            </View>
          ))}
          {specs.length > 5 && (
            <View style={{ borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.background, borderColor: C.border }}>
              <Text style={{ fontSize: 11, fontWeight: Font.semibold, color: C.textMuted }}>+{specs.length - 5} more</Text>
            </View>
          )}
        </View>
      )}

      {/* Action row */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: C.orange, paddingVertical: 11, backgroundColor: 'rgba(255,98,0,0.06)' }}
          onPress={() => router.push(`/company/${contractor.id}` as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="business-outline" size={15} color={C.orange} />
          <Text style={{ fontSize: 13, fontWeight: Font.black, color: C.orange }}>View Profile</Text>
          <Ionicons name="arrow-forward" size={13} color={C.orange} />
        </TouchableOpacity>
        {onMessage && (
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingVertical: 11, backgroundColor: C.background }}
            onPress={onMessage}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={15} color={C.textPrimary} />
            <Text style={{ fontSize: 13, fontWeight: Font.black, color: C.textPrimary }}>Message</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FindContractorScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { trade: tradeParam, category: categoryParam, aiMatched, jobTitle, query: aiQuery } =
    useLocalSearchParams<{ trade?: string; category?: string; aiMatched?: string; jobTitle?: string; query?: string }>();

  const [contractors,   setContractors]   = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(tradeParam ?? categoryParam ?? 'All');
  const [search,        setSearch]        = useState('');
  const [focused,       setFocused]       = useState(false);

  const loadContractors = async (trade?: string) => {
    const filter    = trade ?? selectedTrade;
    const p_category = filter && filter !== 'All' ? filter : null;
    try {
      const { data, error } = await supabase.rpc('get_ranked_contractors', {
        p_category,
        p_area:                  null,
        p_pro_priority_featured: false,
      });
      if (error) throw error;
      setContractors(data ?? []);
    } catch (err) {
      console.log('contractors load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadContractors(selectedTrade); }, [selectedTrade]);

  const handleMessage = async (contractor: any) => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_id', user.id)
        .eq('contractor_id', contractor.id)
        .maybeSingle();

      if (existing) {
        router.push(`/chat/${existing.id}`);
        return;
      }

      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          `Contact ${contractor.company_name}?`,
          `This opens a direct line with ${contractor.company_name}. Only reach out if you\'re genuinely interested in hiring them.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Contact Contractor', onPress: () => resolve(true) },
          ],
        )
      );
      if (!confirmed) return;

      const { data: created, error } = await supabase
        .from('conversations')
        .insert({
          customer_id:     user.id,
          contractor_id:   contractor.id,
          customer_name:   user.user_metadata?.full_name ?? user.email,
          contractor_name: contractor.company_name,
          status:          'pending',
        })
        .select()
        .single();

      if (error) throw error;
      router.push(`/chat/${created.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const suggestions = search.trim().length > 0
    ? ALL_TRADE_SPECIALTIES
        .filter(s => s.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 10)
    : [];

  // RPC already returns featured first + server-side random(); just split for display
  const { featuredContractors, standardContractors } = useMemo(() => {
    const q        = search.trim().toLowerCase();
    const filtered = !q ? contractors : contractors.filter((c: any) =>
      c.company_name?.toLowerCase().includes(q) ||
      c.trade_type?.toLowerCase().includes(q) ||
      (Array.isArray(c.specializations) && c.specializations.some((sp: string) => sp.toLowerCase().includes(q)))
    );
    return {
      featuredContractors: filtered.filter((c: any) => c.plan === 'pro' || c.plan === 'leads'),
      standardContractors: filtered.filter((c: any) => c.plan !== 'pro' && c.plan !== 'leads'),
    };
  }, [contractors, search]);

  const totalFiltered = featuredContractors.length + standardContractors.length;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find Contractor</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by trade, specialty, or contractor..."
              placeholderTextColor="#444"
              value={search}
              onChangeText={setSearch}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              selectionColor={Colors.orange}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setFocused(false); }}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Suggestions panel */}
        {focused && (
          <View style={styles.suggestionsPanel}>
            {search.trim() === '' ? (
              <>
                <Text style={styles.suggestionsLabel}>POPULAR SEARCHES</Text>
                {Object.entries(POPULAR_SEARCHES).map(([trade, items]) => (
                  <View key={trade} style={styles.suggestionsGroup}>
                    <Text style={styles.suggestionsGroupLabel}>
                      {TRADE_ICONS[trade] ?? '🔧'} {trade}
                    </Text>
                    <View style={styles.suggestionsGroupChips}>
                      {items.map(item => (
                        <TouchableOpacity
                          key={item}
                          onPress={() => { setSearch(item); setFocused(false); }}
                          style={styles.suggestionChip}
                        >
                          <Text style={styles.suggestionChipText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            ) : suggestions.length > 0 ? (
              suggestions.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setSearch(s); setFocused(false); }}
                  style={styles.suggestionRow}
                >
                  <Text style={styles.suggestionRowIcon}>🔍</Text>
                  <Text style={styles.suggestionRowText}>{s}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.suggestionsEmpty}>No matching specialties found</Text>
            )}
          </View>
        )}

        {/* Trade filter pills */}
        {!focused && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContent}
          >
            {['All', ...ALL_TRADES].map((trade) => (
              <TouchableOpacity
                key={trade}
                style={[styles.filterPill, selectedTrade === trade && styles.filterPillActive]}
                onPress={() => setSelectedTrade(trade)}
              >
                {trade !== 'All' && <Text style={styles.filterPillIcon}>{TRADE_ICONS[trade]}</Text>}
                <Text style={[styles.filterPillText, selectedTrade === trade && styles.filterPillTextActive]}>
                  {trade}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Live count */}
        {!focused && (
          <View style={styles.statusBar}>
            <View style={styles.liveDot} />
            <Text style={styles.statusText}>
              {totalFiltered} {totalFiltered === 1 ? 'contractor' : 'contractors'} available now
              {featuredContractors.length > 0 ? ` · ${featuredContractors.length} featured` : ''}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={Colors.orange} size="large" />
          <Text style={styles.loadingText}>Finding contractors...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadContractors(selectedTrade); }}
              tintColor={Colors.orange}
            />
          }
        >
          {totalFiltered === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={styles.emptyTitle}>No contractors available</Text>
              <Text style={styles.emptyBody}>
                {selectedTrade !== 'All'
                  ? `No ${selectedTrade} contractors active right now. Try a different trade or post a job.`
                  : 'No contractors are currently active. Post a job and contractors will apply.'}
              </Text>
              <TouchableOpacity
                style={styles.postJobBtn}
                onPress={() => router.push('/create-job')}
              >
                <Text style={styles.postJobBtnText}>Post a Job Instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── AI match banner ── */}
              {aiMatched === 'true' && !!(categoryParam || jobTitle) && (
                <View style={styles.aiBanner}>
                  <Text style={{ fontSize: 18 }}>✨</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiBannerTitle}>{jobTitle || categoryParam}</Text>
                    {!!aiQuery && <Text style={styles.aiBannerSub}>"{aiQuery}"</Text>}
                  </View>
                </View>
              )}

              {/* ── Featured Pros (pro + leads) — server-shuffled each request ── */}
              {featuredContractors.length > 0 && (
                <>
                  <View style={styles.featuredHeader}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.featuredHeaderText}>Featured Pros</Text>
                    <View style={styles.featuredHeaderBadge}>
                      <Text style={styles.featuredHeaderBadgeText}>TOP PICKS</Text>
                    </View>
                  </View>
                  {featuredContractors.map((c: any) => (
                    <CompanyCard
                      key={c.id}
                      contractor={c}
                      showGlow={true}
                      onMessage={() => handleMessage(c)}
                    />
                  ))}
                  {standardContractors.length > 0 && (
                    <View style={styles.sectionDivider}>
                      <View style={styles.sectionDividerLine} />
                      <Text style={styles.sectionDividerText}>More Contractors</Text>
                      <View style={styles.sectionDividerLine} />
                    </View>
                  )}
                </>
              )}

              {/* ── Standard contractors (free) ── */}
              {standardContractors.map((c: any) => (
                <CompanyCard
                  key={c.id}
                  contractor={c}
                  onMessage={() => handleMessage(c)}
                />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow:    { fontSize: 18, color: Colors.white },
  headerTitle:  { fontSize: 18, fontWeight: Font.black, color: Colors.white },

  searchWrap:   { paddingHorizontal: Spacing.lg, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#141414', borderRadius: 14,
    borderWidth: 1, borderColor: '#1E1E1E',
    paddingHorizontal: 14, height: 48,
  },
  searchBarFocused: { borderColor: Colors.orange },
  searchIcon:   { fontSize: 16 },
  searchInput:  { flex: 1, fontSize: 14, color: Colors.white },
  searchClear:  { fontSize: 16, color: '#666' },

  filterScroll: { borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  filterContent:{ paddingHorizontal: Spacing.lg, paddingBottom: 12, gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, backgroundColor: '#141414',
    borderWidth: 1.5, borderColor: '#2A2A2A',
  },
  filterPillActive:     { backgroundColor: Colors.orangeDim, borderColor: Colors.orange },
  filterPillIcon:       { fontSize: 14 },
  filterPillText:       { fontSize: 12, fontWeight: Font.semibold, color: '#666' },
  filterPillTextActive: { color: Colors.orange },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
  },
  liveDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusText: { fontSize: 12, color: '#22C55E', fontWeight: Font.semibold },

  scroll:       { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: 14 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText:  { fontSize: 14, color: '#666' },

  emptyState:   { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon:    { fontSize: 56 },
  emptyTitle:   { fontSize: 20, fontWeight: Font.black, color: Colors.white },
  emptyBody:    { fontSize: 14, color: '#666', textAlign: 'center', maxWidth: '78%', lineHeight: 21 },
  postJobBtn:   { marginTop: Spacing.md, backgroundColor: Colors.orange, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  postJobBtnText: { fontSize: 14, fontWeight: Font.black, color: Colors.background },

  aiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,98,0,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,98,0,0.25)',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  aiBannerTitle: { fontSize: 14, fontWeight: Font.black, color: Colors.orange, marginBottom: 1 },
  aiBannerSub:   { fontSize: 11, color: '#888' },

  featuredHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 4,
  },
  featuredHeaderText:  { flex: 1, fontSize: 13, fontWeight: Font.black, color: '#FBBF24' },
  featuredHeaderBadge: {
    backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  featuredHeaderBadgeText: { fontSize: 9, fontWeight: Font.black, color: '#FBBF24', letterSpacing: 0.6 },

  sectionDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginVertical: 4,
  },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: '#1E1E1E' },
  sectionDividerText: { fontSize: 11, fontWeight: Font.semibold, color: '#444' },

  suggestionsPanel: {
    backgroundColor: '#141414', borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
    maxHeight: 400,
  },
  suggestionsLabel:      { fontSize: 10, fontWeight: Font.black, color: '#444', letterSpacing: 0.8, paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 4 },
  suggestionsGroup:      { paddingHorizontal: Spacing.lg, paddingBottom: 12 },
  suggestionsGroupLabel: { fontSize: 12, fontWeight: Font.semibold, color: '#888', marginBottom: 7 },
  suggestionsGroupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip:        { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
  suggestionChipText:    { fontSize: 12, fontWeight: Font.semibold, color: '#C0C0C0' },
  suggestionRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  suggestionRowIcon:     { fontSize: 13, color: '#555' },
  suggestionRowText:     { fontSize: 14, color: '#D0D0D0', fontWeight: Font.medium, flex: 1 },
  suggestionsEmpty:      { fontSize: 13, color: '#555', padding: Spacing.lg },
});
