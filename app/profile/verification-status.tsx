// app/profile/verification-status.tsx
// Shows current verification status — pending, approved, or rejected with reason

import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font } from '../../constants/theme';
import { OnboardingColors as OC, OnboardingSpacing as OS2, FontSize as FS } from '@/lib/design/onboarding-tokens';

const SP = { 2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;

type VerificationStatus = 'unverified' | 'pending_review' | 'approved' | 'rejected';

const STATUS_CONFIG = {
  unverified: {
    icon:    'shield-outline',
    color:   OC.textSecondary,
    bg:      'rgba(154,154,154,0.1)',
    title:   'Not Verified',
    message: 'Complete the verification process to unlock the Tradease Verified badge and build trust with customers.',
  },
  pending_review: {
    icon:    'time-outline',
    color:   OC.warning,
    bg:      'rgba(251,191,36,0.1)',
    title:   'Under Review',
    message: 'Your application is being reviewed by our team. This typically takes less than 72 hours. We\'ll notify you when it\'s approved.',
  },
  approved: {
    icon:    'shield-checkmark',
    color:   OC.success,
    bg:      'rgba(34,197,94,0.1)',
    title:   'Tradease Verified ✓',
    message: 'Your profile has been verified. Customers can see your verified badge when browsing contractors.',
  },
  rejected: {
    icon:    'close-circle-outline',
    color:   OC.error,
    bg:      'rgba(239,68,68,0.1)',
    title:   'Verification Rejected',
    message: 'Your application was not approved. See the reason below and resubmit with corrected information.',
  },
};

// Same three while-you-wait actions as VerificationGate's pending_review
// state and get-verified.tsx's post-submit screen -- this is now a third
// independent copy (each file already had its own before this touched
// screen was added). Not extracted to a shared constant here: doing so
// would mean reopening those two already-committed files, which wasn't
// asked for. Flagged as duplication debt, not fixed silently.
const NEXT_STEPS = [
  { icon: 'business-outline' as const, title: 'Build your company profile', sub: 'Services, service area, and pricing', to: '/profile/company-profile' as const },
  { icon: 'images-outline' as const, title: 'Add portfolio photos', sub: 'Customers see this before anything else', to: '/profile/portfolio' as const },
  { icon: 'briefcase-outline' as const, title: 'Browse open jobs', sub: 'See what\'s nearby now', to: '/(tabs)/contractor-home' as const },
];

const CHECKLIST = [
  { key:'legal_name',        label:'Legal name',          field:'legal_name' },
  { key:'license_number',    label:'License number',      field:'license_number' },
  { key:'license_state',     label:'Issuing state',       field:'license_state' },
  { key:'insurance_doc_path',label:'Insurance document',  field:'insurance_doc_path' },
  { key:'id_doc_path',       label:'Government ID',       field:'id_doc_path' },
  { key:'service_area',      label:'Service area',        field:'service_area' },
];

export default function VerificationStatusScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const [profile, setProfile]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: contractor }, { data: verification }] = await Promise.all([
        supabase
          .from('contractors')
          .select('company_name,service_area,verification_status,verification_rejection_reason,approved')
          .eq('id', user.id)
          .single(),
        supabase
          .from('contractor_verification')
          .select('license_number,license_state,insurance_doc_path,id_doc_path,submitted_at')
          .eq('contractor_id', user.id)
          .maybeSingle(),
      ]);

      setProfile({
        // "Legal name" has no dedicated column anywhere — company_name is the
        // closest real field, set on the company profile, not by this submission.
        legal_name:                    contractor?.company_name ?? null,
        service_area:                  contractor?.service_area ?? null,
        verification_status:           contractor?.verification_status ?? null,
        verification_rejection_reason: contractor?.verification_rejection_reason ?? null,
        approved:                      contractor?.approved ?? null,
        license_number:                verification?.license_number ?? null,
        license_state:                 verification?.license_state ?? null,
        insurance_doc_path:            verification?.insurance_doc_path ?? null,
        id_doc_path:                   verification?.id_doc_path ?? null,
        verification_submitted_at:     verification?.submitted_at ?? null,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const status: VerificationStatus = profile?.verification_status ?? 'unverified';
  const cfg = STATUS_CONFIG[status];
  const submittedAt = profile?.verification_submitted_at
    ? new Date(profile.verification_submitted_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
    : null;

  const missingFields = CHECKLIST.filter(c => !profile?.[c.field]);
  const completedFields = CHECKLIST.filter(c => !!profile?.[c.field]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { borderBottomColor:C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color:C.textPrimary }]}>Verification</Text>
        <View style={{ width:36 }} />
      </View>

      <View style={{ flex:1, paddingHorizontal:SP[5], paddingTop:SP[6] }}>

        {/* Status hero */}
        <View style={[s.heroCard, { backgroundColor:C.surface, borderColor:cfg.color + '40' }]}>
          <View style={[s.heroIcon, { backgroundColor:cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={36} color={cfg.color} />
          </View>
          <Text style={[s.heroTitle, { color:cfg.color }]}>{cfg.title}</Text>
          <Text style={[s.heroMessage, { color:C.textSecondary }]}>{cfg.message}</Text>
          {submittedAt && (
            <Text style={[s.heroDate, { color:C.textMuted }]}>Submitted {submittedAt}</Text>
          )}
        </View>

        {/* Rejection reason -- a rule, not a filled box (rule 3: status is
            a rule and text, never a fill) */}
        {status === 'rejected' && profile?.verification_rejection_reason && (
          <View style={[s.statusRule, { borderLeftColor: OC.error }]}>
            <Text style={{ fontSize:FS.xs, fontWeight:Font.black, color: OC.error, letterSpacing:0.5, marginBottom:4 }}>REASON</Text>
            <Text style={{ fontSize:FS.base, color: OC.error, lineHeight:20 }}>{profile.verification_rejection_reason}</Text>
          </View>
        )}

        {/* While you wait -- pending_review otherwise has no action at all
            on this screen (no CTA renders for it below), just a hero and
            a checklist. Same dead-end this funnel had in get-verified.tsx
            and VerificationGate. */}
        {status === 'pending_review' && (
          <View style={{ marginTop:SP[5] }}>
            <Text style={[s.sectionLabel, { color:C.textMuted }]}>WHILE YOU WAIT</Text>
            {NEXT_STEPS.map(item => (
              <TouchableOpacity
                key={item.to}
                style={[s.nextStepRow, { backgroundColor:C.surface, borderColor:C.border }]}
                onPress={() => router.push(item.to as any)}
                activeOpacity={0.7}
              >
                <View style={[s.nextStepIcon, { backgroundColor: 'rgba(255,98,0,0.12)' }]}>
                  <Ionicons name={item.icon} size={18} color={C.orange} />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[s.checkLabel, { color:C.textPrimary }]}>{item.title}</Text>
                  <Text style={{ fontSize:FS.xs, color:C.textMuted, marginTop:1 }}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Checklist */}
        {status !== 'approved' && (
          <View style={{ marginTop:SP[5] }}>
            <Text style={[s.sectionLabel, { color:C.textMuted }]}>YOUR INFORMATION</Text>
            <View style={[s.card, { backgroundColor:C.surface, borderColor:C.border }]}>
              {CHECKLIST.map((item, i) => {
                const done = !!profile?.[item.field];
                return (
                  <View key={item.key}>
                    {i > 0 && <View style={[s.divider, { backgroundColor:C.border }]} />}
                    <View style={s.checkRow}>
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={done ? OC.success : C.textMuted}
                      />
                      <Text style={[s.checkLabel, { color: done ? C.textPrimary : C.textMuted }]}>
                        {item.label}
                      </Text>
                      {!done && <Text style={{ fontSize:FS.xs, color:C.orange, fontWeight:Font.bold }}>Missing</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* What verification unlocks */}
        {status === 'approved' && (
          <View style={{ marginTop:SP[5] }}>
            <Text style={[s.sectionLabel, { color:C.textMuted }]}>WHAT YOU UNLOCKED</Text>
            <View style={[s.card, { backgroundColor:C.surface, borderColor:C.border }]}>
              {[
                { icon:'shield-checkmark', color: OC.success, text:'Verified badge on your profile' },
                { icon:'trending-up',      color:C.orange,  text:'Higher ranking in search results' },
                { icon:'star',             color: OC.warning, text:'Customer trust signal' },
                { icon:'lock-closed',      color: OC.info, text:'Tradease payment protection' },
              ].map((item, i) => (
                <View key={item.text}>
                  {i > 0 && <View style={[s.divider, { backgroundColor:C.border }]} />}
                  <View style={s.checkRow}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                    <Text style={[s.checkLabel, { color:C.textPrimary }]}>{item.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* CTA */}
      {(status === 'unverified' || status === 'rejected') && (
        <View style={[s.footer, { borderTopColor:C.border }]}>
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor:C.orange }]}
            onPress={() => router.push('/profile/get-verified')}
          >
            <Ionicons name="ribbon-outline" size={18} color={OC.white} />
            <Text style={s.ctaBtnText}>
              {status === 'rejected' ? 'Resubmit Verification' : 'Start Verification'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1 },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:OS2.xl, paddingVertical:OS2.lg, borderBottomWidth:0.5 },
  backBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:FS.xl2, fontWeight:'700', letterSpacing:-0.3 },
  heroCard:     { borderRadius:20, borderWidth:1, padding:OS2.xl2, alignItems:'center', gap:12 },
  heroIcon:     { width:72, height:72, borderRadius:36, alignItems:'center', justifyContent:'center' },
  heroTitle:    { fontSize:FS.xxl, fontWeight:'800', textAlign:'center' },
  heroMessage:  { fontSize:FS.md, lineHeight:22, textAlign:'center' },
  heroDate:     { fontSize:FS.sm, marginTop:4 },
  // Left-rule status treatment (rule 3) -- replaces the filled rejection
  // box; shared shape for any future left-rule callout on this screen.
  statusRule:   { borderLeftWidth:3, paddingLeft:OS2.lg, paddingVertical:OS2.xxxs, marginTop:16 },
  sectionLabel: { fontSize:FS.xs, fontWeight:'700', letterSpacing:0.8, marginBottom:10 },
  card:         { borderRadius:16, borderWidth:0.5, overflow:'hidden' },
  checkRow:     { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:OS2.lgXl, paddingVertical:OS2.lg },
  checkLabel:   { flex:1, fontSize:FS.md, fontWeight:'500' },
  divider:      { height:0.5, marginHorizontal:16 },
  // "While you wait" next-step rows (rule 2: cards are for things you can
  // tap) -- same shape as the checklist card's rows, but each is its own
  // bordered, tappable row rather than a shared list container.
  nextStepRow:  { flexDirection:'row', alignItems:'center', gap:12, padding:OS2.lg, borderRadius:12, borderWidth:0.5, marginBottom:8 },
  nextStepIcon: { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  footer:       { paddingHorizontal:OS2.xl, paddingBottom:OS2.footerPad, paddingTop:OS2.mdLg, borderTopWidth:0.5 },
  ctaBtn:       { borderRadius:14, paddingVertical:OS2.lgXl, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  ctaBtnText:   { fontSize:FS.xl, fontWeight:'700', color: OC.white },
});