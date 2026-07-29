// app/profile/subscription.tsx
// Contractor subscription plans — Default, Leads, Pro

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';

const FW = { regular:'400' as const, medium:'500' as const, semibold:'600' as const, bold:'700' as const, black:'800' as const };
const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:8,md:12,lg:16,xl:20,full:999 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;

// ─── Plan data ────────────────────────────────────────────────────────────────

type Feature = { text: string; included: boolean; highlight?: boolean };

const PLANS = [
  {
    key:        'free',
    label:      'Basic Listing',
    tagline:    'Get started with a free profile and start receiving job bookings.',
    monthly:    0,
    annual:     0,
    color:      '#9A9A9A',
    icon:       'shield-outline' as const,
    highlight:  false,
    features: [
      { text: '5 portfolio photos',         included: true  },
      { text: '3 employee accounts',        included: true  },
      { text: 'Basic profile listing',      included: true  },
      { text: 'Visible in search',          included: true  },
      { text: 'Priority placement',         included: false },
      { text: 'Leads badge',                included: false },
      { text: 'Analytics dashboard',        included: false },
      { text: 'Calendar access',            included: false },
    ] as Feature[],
  },
  {
    key:        'leads',
    label:      'Just Leads',
    tagline:    'Show up in searches, get discovered by customers — no booking system required.',
    monthly:    5,
    annual:     50,
    color:      '#38BDF8',
    icon:       'flash' as const,
    highlight:  true,
    badge:      'Most Popular',
    features: [
      { text: '10 portfolio photos',        included: true  },
      { text: '10 employee accounts',       included: true  },
      { text: 'Priority placement',         included: true  },
      { text: 'Leads badge',                included: true  },
      { text: 'Analytics dashboard',        included: true  },
      { text: 'Everything in Free',         included: true  },
      { text: 'Calendar access',            included: false },
      { text: 'Unlimited employees',        included: false },
    ] as Feature[],
  },
  {
    key:        'pro',
    label:      'Pro Subscription',
    tagline:    'Everything you need to dominate your local market.',
    monthly:    19,
    annual:     190,
    color:      '#FF6200',
    icon:       'trophy' as const,
    highlight:  false,
    badge:      'Best Value',
    features: [
      { text: '15 portfolio photos',        included: true },
      { text: 'Unlimited employees',        included: true },
      { text: 'Top placement in search',    included: true },
      { text: 'Pro badge',                  included: true },
      { text: 'Full analytics',             included: true },
      { text: 'Calendar access',            included: true },
      { text: 'Everything in Leads',        included: true },
      { text: 'Dedicated support',          included: true },
    ] as Feature[],
  },
];

// ─── Feature row ──────────────────────────────────────────────────────────────

function Feature({ feature, color, C }: { feature: { text: string; included: boolean; highlight?: boolean }; color: string; C: any }) {
  const { included, highlight, text } = feature;
  return (
    <View style={{ flexDirection:'row', alignItems:'flex-start', gap:SP[2], marginBottom:SP[2] }}>
      {included
        ? <Ionicons name="checkmark-circle" size={16} color={highlight ? '#38BDF8' : color} style={{ marginTop:1 }} />
        : <Ionicons name="close-circle" size={16} color="#444" style={{ marginTop:1 }} />
      }
      <Text style={{
        fontSize: TY.sm,
        color: highlight ? '#38BDF8' : included ? C.textSecondary : C.textMuted,
        flex: 1,
        lineHeight: 20,
        fontWeight: highlight ? FW.bold : FW.regular,
      }}>
        {text}
      </Text>
    </View>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

const PLAN_EMPLOYEE_LIMITS: Record<string, number> = {
  free:  3,
  leads: 10,
  pro:   -1, // unlimited
};

function PlanCard({
  plan, annual, current, onSelect, C, teamUsed,
}: {
  plan: typeof PLANS[number];
  annual: boolean;
  current: string;
  onSelect: (key:string) => void;
  C: any;
  teamUsed: number;
}) {
  const isCurrent  = current === plan.key;
  const price      = annual ? (plan.annual / 12) : plan.monthly;
  const savings    = plan.monthly > 0 ? Math.round((plan.monthly * 12 - plan.annual) / (plan.monthly * 12) * 100) : 0;
  const scale      = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue:0.97, duration:80, useNativeDriver:true }),
      Animated.timing(scale, { toValue:1,    duration:80, useNativeDriver:true }),
    ]).start();
    onSelect(plan.key);
  }

  return (
    <Animated.View style={{ transform:[{ scale }], marginBottom:SP[4] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.92}
        style={[
          styles.planCard,
          {
            backgroundColor: C.surface,
            borderColor:      isCurrent ? plan.color : plan.highlight ? plan.color + '50' : C.border,
            borderWidth:      isCurrent || plan.highlight ? 1.5 : 0.5,
          },
        ]}
      >
        {/* Badge */}
        {plan.badge && (
          <View style={[styles.planBadge, { backgroundColor: plan.color }]}>
            <Text style={styles.planBadgeText}>{plan.badge}</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.planHeader}>
          <View style={[styles.planIconBox, { backgroundColor: plan.color + '18' }]}>
            <Ionicons name={plan.icon as any} size={22} color={plan.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[styles.planName, { color:C.textPrimary }]}>{plan.label}</Text>
            <Text style={[styles.planTagline, { color:C.textSecondary }]}>{plan.tagline}</Text>
          </View>
          {isCurrent && (
            <View style={[styles.currentPill, { backgroundColor: plan.color + '20', borderColor: plan.color + '40' }]}>
              <Text style={[styles.currentPillText, { color:plan.color }]}>Current</Text>
            </View>
          )}
        </View>

        {/* Price */}
        <View style={styles.priceRow}>
          {plan.monthly === 0 ? (
            <Text style={[styles.priceMain, { color:C.textPrimary }]}>Free</Text>
          ) : (
            <>
              <Text style={[styles.priceCurrency, { color:C.textSecondary }]}>$</Text>
              <Text style={[styles.priceMain, { color:plan.color }]}>{Math.round(price)}</Text>
              <Text style={[styles.pricePer, { color:C.textSecondary }]}>/mo</Text>
              {annual && savings > 0 && (
                <View style={[styles.savingsPill, { backgroundColor:'rgba(34,197,94,0.12)' }]}>
                  <Text style={{ fontSize:TY.xs, fontWeight:FW.black, color:'#22C55E' }}>Save {savings}%</Text>
                </View>
              )}
            </>
          )}
        </View>
        {annual && plan.monthly > 0 && (
          <Text style={[styles.billedAnnually, { color:C.textMuted }]}>
            Billed annually — ${plan.annual}/yr
          </Text>
        )}

        {/* Team slot indicator */}
        {(() => {
          const slotLimit = PLAN_EMPLOYEE_LIMITS[plan.key];
          const isUnlimited = slotLimit === -1;
          const isCurrPlan  = current === plan.key;
          const fraction    = isUnlimited ? 1 : Math.min(teamUsed / slotLimit, 1);
          const barColor    = isCurrPlan ? plan.color : C.textMuted;
          return (
            <View style={{ marginBottom:SP[1] }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:SP[1] }}>
                <Text style={{ fontSize:TY.xs, color: C.textMuted }}>Team slots</Text>
                <Text style={{ fontSize:TY.xs, fontWeight:FW.bold, color: isCurrPlan ? plan.color : C.textMuted }}>
                  {isCurrPlan
                    ? (isUnlimited ? `${teamUsed} used · Unlimited` : `${teamUsed} / ${slotLimit} used`)
                    : (isUnlimited ? 'Unlimited' : `${slotLimit} slots`)
                  }
                </Text>
              </View>
              <View style={{ height:4, borderRadius:999, backgroundColor:C.surfaceAlt ?? C.border, overflow:'hidden' }}>
                <View style={{ height:4, borderRadius:999, backgroundColor: barColor, width:`${fraction * 100}%` as any, opacity: isCurrPlan ? 1 : 0.35 }} />
              </View>
            </View>
          );
        })()}

        {/* Divider */}
        <View style={[styles.featureDivider, { backgroundColor:C.border }]} />

        {/* Features */}
        <View style={{ gap:0 }}>
          {plan.features.map(f => <Feature key={f.text} feature={f} color={plan.color} C={C} />)}
        </View>

        {/* CTA */}
        {!isCurrent && (
          <TouchableOpacity
            onPress={handlePress}
            style={[styles.planCta, {
              backgroundColor: plan.highlight ? plan.color : 'transparent',
              borderColor: plan.color,
              borderWidth: plan.highlight ? 0 : 1.5,
            }]}
          >
            <Text style={[styles.planCtaText, { color: plan.highlight ? '#fff' : plan.color }]}>
              {plan.monthly === 0 ? 'Downgrade to Free' : `Upgrade to ${plan.label}`}
            </Text>
          </TouchableOpacity>
        )}
        {isCurrent && (
          <View style={[styles.planCta, { backgroundColor: plan.color + '15', borderWidth:0 }]}>
            <Ionicons name="checkmark-circle" size={16} color={plan.color} />
            <Text style={[styles.planCtaText, { color:plan.color }]}>Your current plan</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Confirm Sheet ───────────────────────────────────────────────────────────

function ConfirmSheet({
  plan, annual, isDev, onConfirm, onClose, upgrading, C,
}: {
  plan: typeof PLANS[number];
  annual: boolean;
  isDev: boolean;
  onConfirm: () => void;
  onClose: () => void;
  upgrading: boolean;
  C: any;
}) {
  const slideAnim = useRef(new Animated.Value(380)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 58,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, []);

  const price       = annual ? Math.round(plan.annual / 12) : plan.monthly;
  const topFeatures = plan.features.filter(f => f.included).slice(0, 4);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' }}
        onPress={upgrading ? undefined : onClose}
      />
      <Animated.View style={[cs.sheet, { backgroundColor: C.surface, transform: [{ translateY: slideAnim }] }]}>

        {/* Handle */}
        <View style={[cs.handle, { backgroundColor: C.border }]} />

        {/* Plan header */}
        <View style={cs.planHeader}>
          <View style={[cs.planIcon, { backgroundColor: plan.color + '18' }]}>
            <Ionicons name={plan.icon as any} size={26} color={plan.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[cs.planName, { color: C.textPrimary }]}>{plan.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
              <Text style={[cs.priceMain, { color: plan.color }]}>${price}</Text>
              <Text style={[cs.pricePer, { color: C.textSecondary }]}>/mo</Text>
              {annual && plan.annual > 0 && (
                <View style={[cs.savePill, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                  <Text style={{ fontSize: TY.xs, fontWeight: FW.black, color: '#22C55E' }}>Save 17%</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Key features */}
        <View style={[cs.featuresBox, { backgroundColor: C.background }]}>
          {topFeatures.map((f, i) => (
            <View key={i} style={cs.featureRow}>
              <Ionicons name="checkmark-circle" size={15} color={plan.color} />
              <Text style={[cs.featureText, { color: C.textSecondary }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        {isDev ? (
          <>
            {/* Dev mode badge */}
            <View style={cs.devNote}>
              <Ionicons name="flask-outline" size={13} color={C.textMuted} />
              <Text style={[cs.devNoteText, { color: C.textMuted }]}>Dev mode — bypasses Stripe for testing</Text>
            </View>

            {/* Activate button */}
            <TouchableOpacity
              style={[cs.primaryBtn, { backgroundColor: plan.color, opacity: upgrading ? 0.65 : 1 }]}
              onPress={onConfirm}
              disabled={upgrading}
              activeOpacity={0.85}
            >
              {upgrading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="flash" size={17} color="#fff" />
                    <Text style={cs.primaryBtnText}>Activate {plan.label}</Text>
                  </>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Coming soon panel */}
            <View style={[cs.comingSoonBox, { backgroundColor: 'rgba(255,98,0,0.06)', borderColor: 'rgba(255,98,0,0.22)' }]}>
              <Ionicons name="time-outline" size={26} color={C.orange} />
              <Text style={[cs.comingSoonTitle, { color: C.textPrimary }]}>Payments Coming Soon</Text>
              <Text style={[cs.comingSoonSub, { color: C.textSecondary }]}>
                Stripe isn't live yet. You'll get early access when {plan.label} subscriptions open.
              </Text>
            </View>

            <TouchableOpacity
              style={[cs.primaryBtn, { backgroundColor: C.orange }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={cs.primaryBtnText}>Got It</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Cancel */}
        <TouchableOpacity
          style={cs.cancelBtn}
          onPress={onClose}
          disabled={upgrading}
        >
          <Text style={[cs.cancelBtnText, { color: C.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SP[5], paddingBottom: SP[10] },
  handle:         { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: SP[3], marginBottom: SP[5] },
  planHeader:     { flexDirection: 'row', alignItems: 'center', gap: SP[3], marginBottom: SP[4] },
  planIcon:       { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  planName:       { fontSize: TY['2xl'], fontWeight: FW.black, letterSpacing: -0.4 },
  priceMain:      { fontSize: 36, fontWeight: FW.black, letterSpacing: -1, lineHeight: 40 },
  pricePer:       { fontSize: TY.base, fontWeight: FW.medium, marginBottom: 4 },
  savePill:       { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4, marginLeft: 2 },
  featuresBox:    { borderRadius: 14, padding: SP[4], gap: SP[2], marginBottom: SP[4] },
  featureRow:     { flexDirection: 'row', alignItems: 'center', gap: SP[2] },
  featureText:    { fontSize: TY.sm, flex: 1, lineHeight: 20 },
  devNote:        { flexDirection: 'row', alignItems: 'center', gap: SP[2], marginBottom: SP[3] },
  devNoteText:    { fontSize: TY.xs, flex: 1 },
  primaryBtn:     { borderRadius: R.lg, paddingVertical: SP[4], alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SP[2], marginBottom: SP[2] },
  primaryBtnText: { fontSize: TY.md, fontWeight: FW.black, color: '#fff' },
  comingSoonBox:  { borderRadius: 16, borderWidth: 1, padding: SP[5], alignItems: 'center', gap: SP[3], marginBottom: SP[4] },
  comingSoonTitle:{ fontSize: TY.md, fontWeight: FW.black },
  comingSoonSub:  { fontSize: TY.sm, textAlign: 'center', lineHeight: 20 },
  cancelBtn:      { alignItems: 'center', paddingVertical: SP[3] },
  cancelBtnText:  { fontSize: TY.base, fontWeight: FW.semibold },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

const DEV_EMAIL = 'joegimapa@gmail.com';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const [annual,      setAnnual]      = useState(false);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading,     setLoading]     = useState(true);
  const [upgrading,   setUpgrading]   = useState(false);
  const [teamUsed,    setTeamUsed]    = useState(0);
  const [userEmail,   setUserEmail]   = useState('');
  const [confirmPlan, setConfirmPlan] = useState<typeof PLANS[number] | null>(null);

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? '');
      const [{ data: contractorData }, { data: summaryData }] = await Promise.all([
        supabase.from('contractors').select('plan').eq('id', user.id).single(),
        supabase.from('contractor_team_summary').select('total_used').eq('contractor_id', user.id).single(),
      ]);
      setCurrentPlan(contractorData?.plan ?? 'free');
      setTeamUsed(summaryData?.total_used ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  async function applyPlanChange(plan: string) {
    setUpgrading(true);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('contractors').update({ plan }).eq('id', user.id);
        setCurrentPlan(plan);
      }
    } finally {
      setUpgrading(false);
    }
  }

  async function handleSelect(plan: string) {
    if (plan === currentPlan) return;

    if (plan === 'free') {
      Alert.alert(
        'Downgrade to Free',
        'You will lose access to paid features immediately.',
        [
          { text:'Cancel', style:'cancel' },
          { text:'Downgrade', style:'destructive', onPress: () => applyPlanChange('free') },
        ],
      );
      return;
    }

    const planData = PLANS.find(p => p.key === plan);
    if (planData) setConfirmPlan(planData);
  }

  async function handleConfirm() {
    if (!confirmPlan) return;
    await applyPlanChange(confirmPlan.key);
    const label = confirmPlan.label;
    setConfirmPlan(null);
    Alert.alert('Plan Activated', `You are now on ${label}.`);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor:C.background }]} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor:C.background }]} edges={['top']}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor:C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color:C.textPrimary }]}>Choose Your Plan</Text>
        <View style={{ width:36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:SP[4], paddingBottom:SP[10] }}>

        {/* Hero */}
        <View style={{ alignItems:'center', paddingVertical:SP[6] }}>
          <Text style={[styles.heroTitle, { color:C.textPrimary }]}>Grow your business{'\n'}with Tradease</Text>
          <Text style={[styles.heroSub, { color:C.textSecondary }]}>
            More jobs, better leads, smarter tools.{'\n'}Cancel anytime.
          </Text>
        </View>

        {/* Billing toggle */}
        <View style={[styles.toggleRow, { backgroundColor:C.surface, borderColor:C.border }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, !annual && { backgroundColor:C.orange }]}
            onPress={() => setAnnual(false)}
          >
            <Text style={[styles.toggleText, { color: !annual ? '#fff' : C.textSecondary }]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, annual && { backgroundColor:C.orange }]}
            onPress={() => setAnnual(true)}
          >
            <Text style={[styles.toggleText, { color: annual ? '#fff' : C.textSecondary }]}>Annual</Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 17%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Cards */}
        {PLANS.map(plan => (
          <PlanCard
            key={plan.key}
            plan={plan}
            annual={annual}
            current={currentPlan}
            onSelect={handleSelect}
            C={C}
            teamUsed={teamUsed}
          />
        ))}

        {/* Footer */}
        <View style={[styles.footerBox, { backgroundColor:C.surface, borderColor:C.border }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={C.textMuted} />
          <Text style={[styles.footerText, { color:C.textMuted }]}>
            Payments processed securely through Stripe. Cancel anytime from Settings. Unused portions of the billing period are non-refundable. Contact support@tradease.app for billing questions.
          </Text>
        </View>
      </ScrollView>

      {upgrading && (
        <View style={[styles.loadingOverlay, { backgroundColor:'rgba(0,0,0,0.65)' }]}>
          <ActivityIndicator color="#FF6200" size="large" />
        </View>
      )}

      {confirmPlan && (
        <ConfirmSheet
          plan={confirmPlan}
          annual={annual}
          isDev={userEmail === DEV_EMAIL}
          onConfirm={handleConfirm}
          onClose={() => setConfirmPlan(null)}
          upgrading={upgrading}
          C={C}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex:1 },
  center:          { flex:1, alignItems:'center', justifyContent:'center' },
  header:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5 },
  backBtn:         { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:     { fontSize:17, fontWeight:'700', letterSpacing:-0.3 },
  heroTitle:       { fontSize:26, fontWeight:'800', textAlign:'center', letterSpacing:-0.5, marginBottom:10 },
  heroSub:         { fontSize:14, textAlign:'center', lineHeight:22 },
  toggleRow:       { flexDirection:'row', borderRadius:12, borderWidth:0.5, padding:3, marginBottom:24 },
  toggleBtn:       { flex:1, paddingVertical:10, borderRadius:10, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6 },
  toggleText:      { fontSize:14, fontWeight:'700' },
  saveBadge:       { backgroundColor:'rgba(34,197,94,0.15)', borderRadius:20, paddingHorizontal:7, paddingVertical:2 },
  saveBadgeText:   { fontSize:10, fontWeight:'800', color:'#22C55E' },
  planCard:        { borderRadius:20, padding:20, position:'relative', overflow:'hidden' },
  planBadge:       { position:'absolute', top:16, right:16, borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  planBadgeText:   { fontSize:11, fontWeight:'800', color:'#fff' },
  planHeader:      { flexDirection:'row', alignItems:'flex-start', gap:12, marginBottom:16, paddingRight:60 },
  planIconBox:     { width:44, height:44, borderRadius:12, alignItems:'center', justifyContent:'center' },
  planName:        { fontSize:20, fontWeight:'800', letterSpacing:-0.3 },
  planTagline:     { fontSize:12, marginTop:2, lineHeight:17 },
  currentPill:     { borderRadius:999, borderWidth:1, paddingHorizontal:10, paddingVertical:4, position:'absolute', right:0, top:0 },
  currentPillText: { fontSize:11, fontWeight:'800' },
  priceRow:        { flexDirection:'row', alignItems:'flex-end', gap:2, marginBottom:4 },
  priceCurrency:   { fontSize:20, fontWeight:'700', marginBottom:4 },
  priceMain:       { fontSize:42, fontWeight:'800', letterSpacing:-1, lineHeight:46 },
  pricePer:        { fontSize:15, fontWeight:'500', marginBottom:6 },
  savingsPill:     { borderRadius:999, paddingHorizontal:8, paddingVertical:3, marginBottom:6, marginLeft:4 },
  billedAnnually:  { fontSize:12, marginBottom:12 },
  featureDivider:  { height:0.5, marginVertical:14 },
  planCta:         { borderRadius:12, paddingVertical:14, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:6, marginTop:16 },
  planCtaText:     { fontSize:15, fontWeight:'800' },
  footerBox:       { flexDirection:'row', gap:10, borderRadius:14, borderWidth:0.5, padding:14, alignItems:'flex-start' },
  footerText:      { flex:1, fontSize:11, lineHeight:17 },
  loadingOverlay:  { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
});