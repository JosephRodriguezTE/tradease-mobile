// app/profile/privacy.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg:'#0A0A0F', surface:'#13131A', border:'#2A2A38',
  primary:'#F5A623', primaryMuted:'rgba(245,166,35,0.12)',
  textPrimary:'#F0F0F5', textSecondary:'#9090A8', textTertiary:'#5A5A70',
};
const SP = { 2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { md:10,lg:16 } as const;
const TY = { xs:11,sm:13,base:15,md:17 } as const;

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect information you provide directly: name, email address, phone number, profile photo, payment methods, and service address. For Contractors, we also collect business name, trade license number, and proof of insurance. We automatically collect device identifiers, app usage data, crash reports, and approximate location when you use our services.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use collected information to: provide and improve the Tradease platform; process payments and work orders; verify contractor credentials; send transactional notifications (booking confirmations, payment receipts); provide customer support; detect and prevent fraud; and comply with legal obligations. We do not use your data to serve third-party advertisements.',
  },
  {
    title: '3. Information Sharing',
    body: 'We share information between Customers and Contractors only as necessary to complete bookings. We share data with Stripe for payment processing, with push notification services for alerts, and with analytics providers under strict confidentiality agreements. We do not sell your personal data to third parties. We may disclose information if required by law or to protect the rights and safety of users.',
  },
  {
    title: '4. Payment Data',
    body: 'All payment card data is handled exclusively by Stripe, our PCI-DSS certified payment processor. Tradease never stores your full card number, CVV, or billing data on our servers. Tradease stores only a tokenized reference to your payment method provided by Stripe.',
  },
  {
    title: '5. Data Retention',
    body: 'We retain your account data for as long as your account is active. Work order records are retained for 7 years for legal and tax purposes. If you delete your account, personal identifying information is removed within 30 days, except where retention is required by law.',
  },
  {
    title: '6. Your Rights',
    body: 'You have the right to: access the personal data we hold about you; correct inaccurate data; request deletion of your account and data; opt out of marketing communications; and export your data in a portable format. To exercise these rights, contact privacy@tradease.app. We will respond within 30 days.',
  },
  {
    title: '7. Security',
    body: 'We use industry-standard encryption (TLS 1.3) for all data in transit. Data at rest is encrypted using AES-256. Access to user data is restricted to authorized personnel on a need-to-know basis. Despite these measures, no system is 100% secure. Please use a strong, unique password for your Tradease account.',
  },
  {
    title: '8. Children\'s Privacy',
    body: 'Tradease is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If we learn that we have collected information from a minor, we will delete it promptly.',
  },
  {
    title: '9. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notification at least 7 days before the change takes effect. Your continued use of Tradease after the effective date constitutes acceptance of the updated policy.',
  },
  {
    title: '10. Contact',
    body: 'For privacy-related questions or requests, contact our Privacy Team at: privacy@tradease.app or Tradease Inc., 123 Trade Street, New York, NY 10001.',
  },
];

const HIGHLIGHTS = [
  { icon:'ban-outline',         color:'#EF4444', text:'We never sell your data' },
  { icon:'card-outline',        color:'#F5A623', text:'Card data held by Stripe only' },
  { icon:'notifications-off-outline', color:'#A78BFA', text:'No ad tracking' },
  { icon:'shield-checkmark-outline',  color:'#22C55E', text:'AES-256 encryption at rest' },
];

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width:36 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={s.effectiveCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
          <View>
            <Text style={s.effectiveLabel}>Last Updated</Text>
            <Text style={s.effectiveDate}>May 25, 2026</Text>
          </View>
        </View>

        <Text style={s.intro}>
          Your privacy matters to us. This policy explains what data we collect, why we collect it, and how you can control it.
        </Text>

        {/* Quick highlights */}
        <View style={s.highlightGrid}>
          {HIGHLIGHTS.map(h => (
            <View key={h.text} style={s.highlightCard}>
              <Ionicons name={h.icon as any} size={20} color={h.color} />
              <Text style={s.highlightText}>{h.text}</Text>
            </View>
          ))}
        </View>

        {SECTIONS.map(sec => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerText}>Questions about your privacy?</Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:privacy@tradease.app')}>
            <Text style={s.footerLink}>privacy@tradease.app</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height:SP[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex:1, backgroundColor:C.bg },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:SP[4], paddingVertical:SP[3], borderBottomWidth:0.5, borderBottomColor:C.border },
  backBtn:        { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:    { fontSize:TY.md, fontWeight:'700', color:C.textPrimary, letterSpacing:-0.3 },
  scroll:         { flex:1 },
  scrollContent:  { paddingHorizontal:SP[5], paddingTop:SP[4] },
  effectiveCard:  { flexDirection:'row', alignItems:'center', gap:SP[3], backgroundColor:C.surface, borderRadius:R.lg, borderWidth:0.5, borderColor:C.border, padding:SP[4], marginBottom:SP[5] },
  effectiveLabel: { fontSize:TY.xs, color:C.textTertiary, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 },
  effectiveDate:  { fontSize:TY.base, color:C.textPrimary, fontWeight:'700', marginTop:2 },
  intro:          { fontSize:TY.base, color:C.textSecondary, lineHeight:24, marginBottom:SP[5] },
  highlightGrid:  { flexDirection:'row', flexWrap:'wrap', gap:SP[3], marginBottom:SP[6] },
  highlightCard:  { flex:1, minWidth:'45%', backgroundColor:C.surface, borderRadius:R.md, borderWidth:0.5, borderColor:C.border, padding:SP[4], gap:SP[2], alignItems:'flex-start' },
  highlightText:  { fontSize:TY.xs, color:C.textSecondary, fontWeight:'600', lineHeight:16 },
  section:        { marginBottom:SP[6] },
  sectionTitle:   { fontSize:TY.base, fontWeight:'700', color:C.primary, marginBottom:SP[3] },
  sectionBody:    { fontSize:TY.sm, color:C.textSecondary, lineHeight:22 },
  footer:         { backgroundColor:C.surface, borderRadius:R.lg, padding:SP[5], marginTop:SP[4], borderWidth:0.5, borderColor:C.border, alignItems:'center', gap:SP[2] },
  footerText:     { fontSize:TY.sm, color:C.textSecondary },
  footerLink:     { fontSize:TY.sm, color:C.primary, fontWeight:'700' },
});