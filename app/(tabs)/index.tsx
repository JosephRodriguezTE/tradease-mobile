import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowRight, Bell, ClipboardList, Compass, Search } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Easing, Image, ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Font, Radius } from '../../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useRole } from '@/hooks/useRole';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { TradeaseLogo } from '../../components/TradeaseLogo';

// ─── Notification bell (shared) ───────────────────────────────────────────────

function NotificationBell() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    let channel: any = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const loadUnread = async () => {
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);
        if (mounted) setUnread(count ?? 0);
      };
      await loadUnread();
      channel = supabase
        .channel(`bell:${user.id}:${Math.random().toString(36).slice(2, 7)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, loadUnread)
        .subscribe();
    })();
    return () => { mounted = false; if (channel) supabase.removeChannel(channel); };
  }, []);

  return (
    <TouchableOpacity
      style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      onPress={() => router.push('/notifications')}
      activeOpacity={0.7}
    >
      <Bell size={20} color={Colors.textPrimary} strokeWidth={2} />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.background }}>
          <Text style={{ fontSize: 9, fontWeight: Font.black, color: Colors.background }}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Messages bell (customer header only — Messages isn't a tab for them) ─────

function MessagesBell() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();

  return (
    <TouchableOpacity
      style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative', marginRight: 8 }}
      onPress={() => router.push('/(tabs)/messages' as any)}
      activeOpacity={0.7}
    >
      <Ionicons name="chatbubble-outline" size={19} color={Colors.textPrimary} strokeWidth={2} />
      {unreadCount > 0 && (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: Colors.background }}>
          <Text style={{ fontSize: 9, fontWeight: Font.black, color: Colors.background }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Shared header ────────────────────────────────────────────────────────────

function AppHeader({ showMessages = false }: { showMessages?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md, paddingTop: 4 }}>
      <View style={{ flex: 1, alignItems: 'flex-start', marginLeft: -10 }}>
        <TradeaseLogo iconSize={40} fontSize={20} gap={-12} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {showMessages && <MessagesBell />}
        <NotificationBell />
      </View>
    </View>
  );
}

// ─── Customer home (unchanged) ────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48 - 12) / 2;

const TRADES = [
  { id: '1', name: 'Electrical',   image: require('../../assets/images/electrical.png'),  keywords: ['electric','wire','outlet','panel','light','power','circuit','breaker','plug'] },
  { id: '2', name: 'Plumbing',     image: require('../../assets/images/plumbing.jpeg'),   keywords: ['pipe','leak','water','drain','toilet','sink','faucet','plumb','shower'] },
  { id: '3', name: 'HVAC',         image: require('../../assets/images/hvac.jpeg'),        keywords: ['ac','air','heat','hvac','cool','furnace','vent','thermostat','conditioner'] },
  { id: '4', name: 'Handyman',     image: require('../../assets/images/handyman.jpg'),     keywords: ['fix','repair','handyman','odd','install','assemble','mount','hang'] },
  { id: '5', name: 'Roofing',      image: require('../../assets/images/roofing.jpg'),      keywords: ['roof','shingle','gutter','leak','attic','skylight','rain'] },
  { id: '6', name: 'Cleaning',     image: require('../../assets/images/cleaning.jpg'),     keywords: ['clean','maid','tidy','sweep','mop','organize','housekeep','vacuum'] },
  { id: '7', name: 'Mechanical',   image: require('../../assets/images/mechanical.jpg'),   keywords: ['car','engine','mechanic','vehicle','auto','motor','transmission','brake'] },
  { id: '8', name: 'Painting',     image: require('../../assets/images/painting.png'),     keywords: ['paint','color','wall','ceiling','stain','drywall','primer','brush'] },
  { id: '9', name: 'Carpentry',    image: require('../../assets/images/carpentry.jpg'),    keywords: ['wood','cabinet','frame','door','window','trim','carpent','furniture'] },
  { id: '10', name: 'Landscaping', image: require('../../assets/images/landscaping.jpg'),  keywords: ['lawn','grass','tree','garden','landscape','yard','bush','mow','plant'] },
];

function CustomerHome() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const [search, setSearch]       = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [clarifyQ, setClarifyQ]   = useState<string | null>(null);
  const [firstName, setFirstName] = useState('there');
  const welcomeOpacity  = useRef(new Animated.Value(0)).current;
  const greetingOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const fullName: string = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
        const first = fullName.split(' ')[0] || '';
        if (first) setFirstName(first);
      }
    })();
    Animated.sequence([
      Animated.timing(welcomeOpacity,  { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(2000),
      Animated.parallel([
        Animated.timing(welcomeOpacity,  { toValue: 0, duration: 800, easing: Easing.in(Easing.cubic),  useNativeDriver: true }),
        Animated.timing(greetingOpacity, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) { setClarifyQ(null); return; }

    setAiLoading(true);
    setClarifyQ(null);

    try {
      const { data, error } = await supabase.functions.invoke('match-and-rank', {
        body: { query: q },
      });

      if (error) throw error;

      const { match, agent_failed } = data;

      if (!agent_failed && (match?.confidence ?? 0) < 0.6 && match?.clarifying_question) {
        setClarifyQ(match.clarifying_question);
        return;
      }

      router.push({
        pathname: '/find-contractor' as any,
        params: {
          category:  match?.category  ?? '',
          aiMatched: 'true',
          jobTitle:  match?.job_title ?? '',
          query:     q,
        },
      });
    } catch (err: any) {
      if (err?.status === 429) {
        Alert.alert('Too many searches', 'Wait a moment before trying again.');
        return;
      }
      router.push('/find-contractor' as any);
    } finally {
      setAiLoading(false);
    }
  };

  const s = StyleSheet.create({
    scroll:       { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },
    title:        { fontSize: 26, fontWeight: Font.black, color: Colors.textPrimary, lineHeight: 34, marginBottom: Spacing.lg },
    searchBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, marginBottom: Spacing.md, gap: 8, height: 54 },
    searchInput:  { flex: 1, fontSize: 14, color: Colors.textPrimary, height: '100%' },
    searchBtn:    { backgroundColor: Colors.orange, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
    matchBanner:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.orangeDim, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.orange, padding: 14, marginBottom: Spacing.md },
    actionRow:    { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
    actionCard:   { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8 },
    actionIconBox:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    actionTitle:  { fontSize: 14, fontWeight: Font.black, color: Colors.textPrimary, lineHeight: 19 },
    actionSub:    { fontSize: 11, color: Colors.textSecondary },
    sectionLabel: { fontSize: 11, fontWeight: Font.bold, color: Colors.textSecondary, letterSpacing: 2, marginBottom: Spacing.md },
    grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card:         { width: CARD_WIDTH, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    imageWrapper: { width: '100%', height: CARD_WIDTH * 0.75, position: 'relative' },
    cardLabel:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    cardName:     { fontSize: 13, fontWeight: Font.bold, color: Colors.textPrimary },
    cardArrow:    { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.orangeDim, alignItems: 'center', justifyContent: 'center' },
  });

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <AppHeader showMessages />

      <View style={{ position: 'relative', height: 72, marginBottom: Spacing.lg }}>
        <Animated.Text style={[s.title, { position: 'absolute', top: 0, left: 0, right: 0, marginBottom: 0, fontSize: 28, fontWeight: '800', color: Colors.orange, opacity: welcomeOpacity }]}>
          Welcome, {firstName}!
        </Animated.Text>
        <Animated.Text style={[s.title, { position: 'absolute', top: 0, left: 0, right: 0, marginBottom: 0, opacity: greetingOpacity }]}>
          Hello, what service{'\n'}do you need?
        </Animated.Text>
      </View>

      <View style={s.searchBox}>
        <Search size={18} color={Colors.textMuted} strokeWidth={2.2} />
        <TextInput style={s.searchInput} placeholder="e.g. my sink is leaking..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} onSubmitEditing={handleSearch} returnKeyType="search" />
        {search.length > 0 && <TouchableOpacity onPress={() => { setSearch(''); setClarifyQ(null); }}><Text style={{ fontSize: 14, color: Colors.textMuted, paddingHorizontal: 4 }}>✕</Text></TouchableOpacity>}
        <TouchableOpacity style={[s.searchBtn, aiLoading && { opacity: 0.7 }]} onPress={handleSearch} disabled={aiLoading}>
          {aiLoading
            ? <ActivityIndicator size="small" color={Colors.background} />
            : <Text style={{ fontSize: 13, fontWeight: Font.bold, color: Colors.background }}>Search</Text>}
        </TouchableOpacity>
      </View>

      {!!clarifyQ && (
        <View style={s.matchBanner}>
          <Text style={{ fontSize: 18 }}>🤔</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: Font.bold, color: Colors.orange, marginBottom: 3 }}>Need more info</Text>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 17 }}>{clarifyQ}</Text>
          </View>
          <TouchableOpacity onPress={() => setClarifyQ(null)}>
            <Text style={{ fontSize: 14, color: Colors.textMuted, padding: 4 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {aiLoading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm }}>
          <ActivityIndicator size="small" color={Colors.orange} />
          <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Finding your trade...</Text>
        </View>
      )}

      <View style={s.actionRow}>
        <TouchableOpacity style={s.actionCard} onPress={() => router.push('/create-job')} activeOpacity={0.85}>
          <View style={[s.actionIconBox, { backgroundColor: 'rgba(255,98,0,0.15)' }]}><ClipboardList size={22} color={Colors.orange} strokeWidth={2.2} /></View>
          <Text style={s.actionTitle}>Create{'\n'}Job Card</Text>
          <Text style={s.actionSub}>Build manually</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionCard} onPress={() => router.push('/find-contractor')} activeOpacity={0.85}>
          <View style={[s.actionIconBox, { backgroundColor: 'rgba(56,189,248,0.15)' }]}><Compass size={22} color="#38BDF8" strokeWidth={2.2} /></View>
          <Text style={s.actionTitle}>Find a{'\n'}Contractor</Text>
          <Text style={s.actionSub}>Browse active pros</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionLabel}>BROWSE BY SERVICE</Text>
      <View style={s.grid}>
        {TRADES.map(trade => (
          <TouchableOpacity key={trade.id} style={s.card} onPress={() => router.push({ pathname: '/create-job', params: { trade: trade.name } })} activeOpacity={0.85}>
            <View style={s.imageWrapper}>
              <Image source={trade.image} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,98,0,0.08)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(13,13,13,0.5)' }} />
            </View>
            <View style={s.cardLabel}>
              <Text style={s.cardName}>{trade.name}</Text>
              <View style={s.cardArrow}><ArrowRight size={11} color={Colors.orange} strokeWidth={2.5} /></View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Contractor home — company card ───────────────────────────────────────────

const PLAN_META: Record<string, { label: string; color: string }> = {
  free:  { label: 'FREE',  color: '#9A9A9A' },
  leads: { label: 'LEADS', color: '#FF6200' },
  pro:   { label: 'PRO',   color: '#FBBF24' },
};

const ACTIVE_JOB_STATUS: Record<string, { color: string; label: string }> = {
  confirmed:   { color: '#22C55E', label: 'Confirmed'         },
  in_progress: { color: '#38BDF8', label: 'In Progress'       },
  completed:   { color: '#A78BFA', label: 'Awaiting Approval' },
};

function StatPill({ value, label, C }: { value: string | number; label: string; C: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 20, fontWeight: Font.black, color: C.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: Font.semibold, color: C.textMuted, letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

function ContractorHome() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { isEmployee, employeeRecord, employerContractorId } = useRole();

  const [profile,     setProfile]     = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [activeJobs,  setActiveJobs]  = useState<any[]>([]);
  const contractorIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const contractorId = isEmployee && employerContractorId ? employerContractorId : user.id;

    const { data } = await supabase
      .from('contractors')
      .select('id,avatar_url,company_name,username,trade_type,location,business_city,business_state,phone,website,description,tagline,rating,review_count,total_bookings,plan,verification_status,verified,insured,license_verified,specializations,portfolio_photos,profile_published,created_at,is_available')
      .eq('id', contractorId)
      .single();

    contractorIdRef.current = contractorId;
    setProfile(data);
    setIsAvailable(data?.is_available ?? false);

    const { data: jobs } = await supabase
      .from('bookings')
      .select('id, trade, status, description, price_estimate')
      .eq('contractor_id', contractorId)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(5);
    setActiveJobs(jobs ?? []);

    setLoading(false);
  }, [isEmployee, employerContractorId]);

  // Initial load + role changes
  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch when returning from personal-info or any sub-screen
  const focusCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCount.current++;
      if (focusCount.current <= 1) return; // skip initial focus, handled by useEffect above
      loadData();
    }, [loadData])
  );

  async function toggleAvailable() {
    if (!contractorIdRef.current) return;
    const newVal = !isAvailable;
    setIsAvailable(newVal);
    const { error } = await supabase
      .from('contractors')
      .update({ is_available: newVal })
      .eq('id', contractorIdRef.current);
    if (error) setIsAvailable(!newVal);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
        <ActivityIndicator color={C.orange} size="large" />
      </View>
    );
  }

  const companyName   = profile?.company_name ?? (isEmployee ? employeeRecord?.full_name : null);
  const displayName   = companyName ?? 'Your Company';
  const initials      = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const planMeta      = PLAN_META[profile?.plan ?? 'free'] ?? PLAN_META.free;
  const isVerified    = profile?.verification_status === 'approved';
  const hasSetup      = !!profile?.company_name;
  const specs: string[] = profile?.specializations ?? [];
  const isTrusted     = !!(
    profile?.company_name?.trim() &&
    profile?.phone?.trim() &&
    profile?.location?.trim() &&
    (profile?.avatar_url?.trim() || profile?.avatar?.trim()) &&
    profile?.username?.trim()
  );
  const avatarUrl     = profile?.avatar_url?.trim() || null;

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Spacing.sm, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader />

      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <View style={[cs.heroCard, { backgroundColor: C.surface, borderColor: C.border }]}>

        {/* Top row: avatar + edit */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
            {/* Avatar */}
            <View style={[cs.avatar, { backgroundColor: 'rgba(255,98,0,0.13)', borderColor: 'rgba(255,98,0,0.3)' }]}>
              {avatarUrl ? (
                <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 18, overflow: 'hidden' }}>
                  <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </View>
              ) : (
                <Text style={cs.avatarText}>{initials}</Text>
              )}
              {isTrusted && (
                <View style={{
                  position: 'absolute', bottom: -4, left: -4,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: '#22C55E',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: C.background,
                }}>
                  <Ionicons name="shield-checkmark" size={11} color="#fff" />
                </View>
              )}
            </View>

            {/* Name + badges */}
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[cs.companyName, { color: C.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {/* Plan badge */}
                <View style={[cs.badge, { backgroundColor: planMeta.color + '18', borderColor: planMeta.color + '40' }]}>
                  <Text style={[cs.badgeText, { color: planMeta.color }]}>{planMeta.label}</Text>
                </View>

                {/* Verified badge */}
                {isVerified && (
                  <View style={[cs.badge, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                    <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
                    <Text style={[cs.badgeText, { color: '#22C55E' }]}>VERIFIED</Text>
                  </View>
                )}

                {/* Online dot */}
                {profile?.is_available && (
                  <View style={[cs.badge, { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' }]}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                    <Text style={[cs.badgeText, { color: '#22C55E' }]}>ONLINE</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Edit button — owners only */}
          {!isEmployee && (
            <TouchableOpacity
              style={[cs.editBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => router.push('/profile/company-profile' as any)}
              activeOpacity={0.75}
            >
              <Ionicons name="pencil-outline" size={14} color={C.orange} />
              <Text style={[cs.editBtnText, { color: C.orange }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Trade + location row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          {profile?.trade_type && (
            <View style={cs.metaRow}>
              <Ionicons name="construct-outline" size={13} color={C.textMuted} />
              <Text style={[cs.metaText, { color: C.textSecondary }]}>{profile.trade_type}</Text>
            </View>
          )}
          {(profile?.location || (profile?.business_city && profile?.business_state)) && (
            <View style={cs.metaRow}>
              <Ionicons name="location-outline" size={13} color={C.textMuted} />
              <Text style={[cs.metaText, { color: C.textSecondary }]}>
                {profile.location ?? `${profile.business_city}, ${profile.business_state}`}
              </Text>
            </View>
          )}
          {profile?.phone && (
            <View style={cs.metaRow}>
              <Ionicons name="call-outline" size={13} color={C.textMuted} />
              <Text style={[cs.metaText, { color: C.textSecondary }]}>{profile.phone}</Text>
            </View>
          )}
        </View>

        {/* Description / tagline */}
        {profile?.description || profile?.tagline ? (
          <Text style={[cs.description, { color: C.textSecondary, borderTopColor: C.border }]} numberOfLines={3}>
            {profile.tagline ?? profile.description}
          </Text>
        ) : !hasSetup ? (
          <View style={[cs.setupPrompt, { backgroundColor: 'rgba(255,98,0,0.06)', borderColor: 'rgba(255,98,0,0.2)' }]}>
            <Ionicons name="information-circle-outline" size={15} color={C.orange} />
            <Text style={[cs.setupPromptText, { color: C.orange }]}>
              Complete your company profile to attract more customers.
            </Text>
            <TouchableOpacity onPress={() => router.push('/profile/company-setup' as any)}>
              <Text style={{ fontSize: 12, fontWeight: Font.black, color: C.orange }}>Set up →</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <View style={[cs.statsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <StatPill value={profile?.total_bookings ?? 0} label="JOBS DONE" C={C} />
        <View style={[cs.statDivider, { backgroundColor: C.border }]} />
        <StatPill value={profile?.rating ? profile.rating.toFixed(1) : '—'} label="RATING" C={C} />
        <View style={[cs.statDivider, { backgroundColor: C.border }]} />
        <StatPill value={profile?.review_count ?? 0} label="REVIEWS" C={C} />
        <View style={[cs.statDivider, { backgroundColor: C.border }]} />
        <StatPill value={(profile?.portfolio_photos?.length ?? 0)} label="PHOTOS" C={C} />
      </View>

      {/* ── Availability toggle ─────────────────────────────────────────── */}
      <TouchableOpacity
        style={[cs.availCard, {
          backgroundColor: isAvailable ? 'rgba(34,197,94,0.06)' : C.surface,
          borderColor: isAvailable ? 'rgba(34,197,94,0.3)' : C.border,
        }]}
        onPress={toggleAvailable}
        activeOpacity={0.85}
      >
        <View style={[cs.availDot, { backgroundColor: isAvailable ? '#22C55E' : C.textMuted }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[cs.availTitle, { color: isAvailable ? '#22C55E' : C.textSecondary }]}>
            {isAvailable ? 'Available for new jobs' : 'Not accepting new jobs'}
          </Text>
          <Text style={[cs.availSub, { color: C.textMuted }]}>
            {isAvailable ? 'Customers can find and book you' : 'Toggle on when you\'re ready for work'}
          </Text>
        </View>
        <Switch
          value={isAvailable}
          onValueChange={toggleAvailable}
          trackColor={{ false: '#2A2A38', true: 'rgba(34,197,94,0.5)' }}
          thumbColor={isAvailable ? '#22C55E' : '#6B6B80'}
          ios_backgroundColor="#2A2A38"
        />
      </TouchableOpacity>

      {/* ── Trust badges ────────────────────────────────────────────────── */}
      <View style={[cs.trustRow]}>
        {[
          { icon: 'shield-checkmark-outline', label: 'Verified',  active: profile?.verified ?? false,          activeColor: '#22C55E' },
          { icon: 'umbrella-outline',          label: 'Insured',   active: profile?.insured ?? false,           activeColor: '#38BDF8' },
          { icon: 'document-text-outline',     label: 'Licensed',  active: profile?.license_verified ?? false,  activeColor: '#A78BFA' },
        ].map(t => (
          <View key={t.label} style={[cs.trustBadge, { backgroundColor: t.active ? t.activeColor + '10' : C.surface, borderColor: t.active ? t.activeColor + '40' : C.border }]}>
            <Ionicons name={t.icon as any} size={16} color={t.active ? t.activeColor : C.textMuted} />
            <Text style={[cs.trustLabel, { color: t.active ? t.activeColor : C.textMuted }]}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Specializations ─────────────────────────────────────────────── */}
      {specs.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[cs.sectionLabel, { color: C.textMuted }]}>SPECIALIZATIONS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {specs.slice(0, 8).map((s: string) => (
              <View key={s} style={[cs.specChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[cs.specChipText, { color: C.textSecondary }]}>{s}</Text>
              </View>
            ))}
            {specs.length > 8 && (
              <View style={[cs.specChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[cs.specChipText, { color: C.textMuted }]}>+{specs.length - 8} more</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Active jobs ──────────────────────────────────────────────────── */}
      {activeJobs.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[cs.sectionLabel, { color: C.textMuted }]}>ACTIVE JOBS</Text>
          <View style={{ gap: 8 }}>
            {activeJobs.map(job => {
              const st = ACTIVE_JOB_STATUS[job.status] ?? ACTIVE_JOB_STATUS.confirmed;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[cs.activeJobCard, { backgroundColor: C.surface, borderColor: job.status === 'completed' ? 'rgba(167,139,250,0.3)' : C.border }]}
                  onPress={() => router.push(`/job/${job.id}` as any)}
                  activeOpacity={0.82}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={[cs.activeJobTrade, { color: C.textPrimary }]}>{job.trade}</Text>
                      <View style={[cs.activeJobPill, { backgroundColor: st.color + '18' }]}>
                        <Text style={[cs.activeJobPillText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    {!!job.description && (
                      <Text style={[cs.activeJobDesc, { color: C.textSecondary }]} numberOfLines={1}>{job.description}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <Text style={[cs.sectionLabel, { color: C.textMuted }]}>QUICK ACTIONS</Text>
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          style={[cs.actionBtn, { backgroundColor: C.orange }]}
          onPress={() => router.push('/(tabs)/jobs' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="flash-outline" size={18} color="#fff" />
          <Text style={cs.actionBtnText}>View Live Job Feed</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[cs.actionBtnSmall, { backgroundColor: C.surface, borderColor: C.border, flex: 1 }]}
            onPress={() => router.push('/profile/company-profile' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="business-outline" size={16} color={C.orange} />
            <Text style={[cs.actionBtnSmallText, { color: C.textPrimary }]}>Company Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cs.actionBtnSmall, { backgroundColor: C.surface, borderColor: C.border, flex: 1 }]}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={16} color={C.orange} />
            <Text style={[cs.actionBtnSmallText, { color: C.textPrimary }]}>Notifications</Text>
          </TouchableOpacity>
        </View>

        {!isEmployee && (
          <TouchableOpacity
            style={[cs.actionBtnSmall, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push('/profile/employees' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="people-outline" size={16} color="#38BDF8" />
            <Text style={[cs.actionBtnSmallText, { color: C.textPrimary }]}>Manage Team</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}
      </View>

    </ScrollView>
  );
}

// ─── Stylesheet for contractor home ──────────────────────────────────────────

const cs = StyleSheet.create({
  heroCard:       { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 12 },
  avatar:         { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, position: 'relative' },
  avatarText:     { fontSize: 22, fontWeight: Font.black, color: '#FF6200' },
  tradeEmojiBadge:{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  companyName:    { fontSize: 20, fontWeight: Font.black, letterSpacing: -0.3, lineHeight: 24 },
  badge:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:      { fontSize: 10, fontWeight: Font.black, letterSpacing: 0.4 },
  editBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  editBtnText:    { fontSize: 12, fontWeight: Font.black },
  metaRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:       { fontSize: 13 },
  description:    { fontSize: 14, lineHeight: 22, borderTopWidth: 0.5, paddingTop: 14, marginTop: 2 },
  setupPrompt:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 8 },
  setupPromptText:{ fontSize: 13, flex: 1, lineHeight: 18 },

  statsCard:      { flexDirection: 'row', borderRadius: 16, borderWidth: 1, paddingVertical: 16, marginBottom: 12 },
  statDivider:    { width: 1, marginVertical: 4 },

  trustRow:       { flexDirection: 'row', gap: 8, marginBottom: 16 },
  trustBadge:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  trustLabel:     { fontSize: 11, fontWeight: Font.bold },

  sectionLabel:   { fontSize: 10, fontWeight: Font.black, letterSpacing: 1, marginBottom: 10 },
  specChip:       { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  specChipText:   { fontSize: 12, fontWeight: Font.semibold },

  actionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18 },
  actionBtnText:  { fontSize: 15, fontWeight: Font.black, color: '#fff' },
  actionBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingVertical: 13, paddingHorizontal: 16 },
  actionBtnSmallText: { fontSize: 14, fontWeight: Font.semibold },

  availCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  availDot:   { width: 10, height: 10, borderRadius: 5 },
  availTitle: { fontSize: 14, fontWeight: Font.bold },
  availSub:   { fontSize: 11 },

  activeJobCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 12 },
  activeJobTrade:    { fontSize: 14, fontWeight: Font.bold },
  activeJobPill:     { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  activeJobPillText: { fontSize: 10, fontWeight: Font.black },
  activeJobDesc:     { fontSize: 12 },
});

// ─── Root export ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors: C } = useTheme();
  const { isContractor, loading: roleLoading } = useRole();

  if (roleLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top']}>
      {isContractor ? <ContractorHome /> : <CustomerHome />}
    </SafeAreaView>
  );
}
