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

const SP = { 2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;

type VerificationStatus = 'unverified' | 'pending_review' | 'approved' | 'rejected';

const STATUS_CONFIG = {
  unverified: {
    icon:    'shield-outline',
    color:   '#9A9A9A',
    bg:      'rgba(154,154,154,0.1)',
    title:   'Not Verified',
    message: 'Complete the verification process to unlock the Tradease Verified badge and build trust with customers.',
  },
  pending_review: {
    icon:    'time-outline',
    color:   '#FBBF24',
    bg:      'rgba(251,191,36,0.1)',
    title:   'Under Review',
    message: 'Your application is being reviewed by our team. This typically takes less than 24 hours. We\'ll notify you when it\'s approved.',
  },
  approved: {
    icon:    'shield-checkmark',
    color:   '#22C55E',
    bg:      'rgba(34,197,94,0.1)',
    title:   'Tradease Verified ✓',
    message: 'Your profile has been verified. Customers can see your verified badge when browsing contractors.',
  },
  rejected: {
    icon:    'close-circle-outline',
    color:   '#EF4444',
    bg:      'rgba(239,68,68,0.1)',
    title:   'Verification Rejected',
    message: 'Your application was not approved. See the reason below and resubmit with corrected information.',
  },
};

const CHECKLIST = [
  { key:'legal_name',     label:'Legal name',          field:'legal_name' },
  { key:'license_number', label:'License number',       field:'license_number' },
  { key:'license_state',  label:'Issuing state',        field:'license_state' },
  { key:'insurance_url',  label:'Insurance document',   field:'insurance_url' },
  { key:'service_area',   label:'Service area',         field:'service_area' },
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
      const { data } = await supabase
        .from('contractors')
        .select('legal_name,license_number,license_state,insurance_url,service_area,verification_status,verification_submitted_at,verification_rejection_reason,approved')
        .eq('id', user.id)
        .single();
      setProfile(data);
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

        {/* Rejection reason */}
        {status === 'rejected' && profile?.verification_rejection_reason && (
          <View style={[s.rejectionBox, { backgroundColor:'rgba(239,68,68,0.08)', borderColor:'rgba(239,68,68,0.25)' }]}>
            <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:TY.xs, fontWeight:Font.black, color:'#EF4444', letterSpacing:0.5, marginBottom:4 }}>REASON</Text>
              <Text style={{ fontSize:TY.sm, color:'#EF4444', lineHeight:20 }}>{profile.verification_rejection_reason}</Text>
            </View>
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
                        color={done ? '#22C55E' : C.textMuted}
                      />
                      <Text style={[s.checkLabel, { color: done ? C.textPrimary : C.textMuted }]}>
                        {item.label}
                      </Text>
                      {!done && <Text style={{ fontSize:TY.xs, color:C.orange, fontWeight:Font.bold }}>Missing</Text>}
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
                { icon:'shield-checkmark', color:'#22C55E', text:'Verified badge on your profile' },
                { icon:'trending-up',      color:C.orange,  text:'Higher ranking in search results' },
                { icon:'star',             color:'#FBBF24', text:'Customer trust signal' },
                { icon:'lock-closed',      color:'#60A5FA', text:'Tradease payment protection' },
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
            <Ionicons name="ribbon-outline" size={18} color="#fff" />
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
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingVertical:14, borderBottomWidth:0.5 },
  backBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:17, fontWeight:'700', letterSpacing:-0.3 },
  heroCard:     { borderRadius:20, borderWidth:1, padding:24, alignItems:'center', gap:12 },
  heroIcon:     { width:72, height:72, borderRadius:36, alignItems:'center', justifyContent:'center' },
  heroTitle:    { fontSize:22, fontWeight:'800', textAlign:'center' },
  heroMessage:  { fontSize:14, lineHeight:22, textAlign:'center' },
  heroDate:     { fontSize:12, marginTop:4 },
  rejectionBox: { flexDirection:'row', gap:12, borderRadius:12, borderWidth:1, padding:14, marginTop:16, alignItems:'flex-start' },
  sectionLabel: { fontSize:11, fontWeight:'700', letterSpacing:0.8, marginBottom:10 },
  card:         { borderRadius:16, borderWidth:0.5, overflow:'hidden' },
  checkRow:     { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:14 },
  checkLabel:   { flex:1, fontSize:14, fontWeight:'500' },
  divider:      { height:0.5, marginHorizontal:16 },
  footer:       { paddingHorizontal:20, paddingBottom:34, paddingTop:12, borderTopWidth:0.5 },
  ctaBtn:       { borderRadius:14, paddingVertical:16, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  ctaBtnText:   { fontSize:16, fontWeight:'700', color:'#fff' },
});