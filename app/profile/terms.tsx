// app/profile/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg:'#0A0A0F', surface:'#13131A', border:'#2A2A38',
  primary:'#F5A623', primaryMuted:'rgba(245,166,35,0.12)',
  textPrimary:'#F0F0F5', textSecondary:'#9090A8', textTertiary:'#5A5A70',
};
const SP = { 2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { md:10,lg:16 } as const;
const TY = { xs:11,sm:13,base:15,md:17,xl:24 } as const;

interface Section { title: string; body: string; }

const SECTIONS: Section[] = [
  {
    title: '1. Acceptance of Terms',
    body:  'By downloading, installing, or using the Tradease mobile application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App. Tradease Inc. ("we," "us," or "our") reserves the right to update these Terms at any time. Continued use of the App after changes constitutes acceptance.',
  },
  {
    title: '2. Description of Service',
    body:  'Tradease is a marketplace platform that connects customers seeking trade services ("Customers") with licensed service providers ("Contractors"). Tradease does not directly provide any trade or home improvement services. We are not a party to any agreement between Customers and Contractors beyond facilitating the connection and payment.',
  },
  {
    title: '3. Eligibility',
    body:  'You must be at least 18 years of age to use Tradease. By using the App, you represent and warrant that you meet this requirement. Contractors must hold all applicable licenses and insurance required by their local jurisdiction. Tradease reserves the right to verify credentials at any time.',
  },
  {
    title: '4. Contractor Verification',
    body:  'Tradease verifies contractor credentials including license numbers, proof of insurance, and trade type at the time of registration. The "Tradease Verified" badge indicates that we have reviewed submitted documentation at a point in time. Tradease does not guarantee the ongoing accuracy, validity, or completeness of contractor credentials. Customers should conduct their own due diligence.',
  },
  {
    title: '5. Payments & Fees',
    body:  'Tradease charges a platform service fee added to the contractor\'s quoted price. This fee ranges from 6% to 10% based on the total job amount and is disclosed transparently before payment is authorized. Estimated sales tax is shown separately and is based on the customer\'s location. Final tax amounts are determined at the time of payment. All payments are processed through Stripe and are subject to Stripe\'s Terms of Service.',
  },
  {
    title: '6. Work Orders & Approval',
    body:  'Upon job completion, contractors submit a work order detailing services rendered and associated costs. Customers have 24 hours to review and either approve or dispute the work order. If no action is taken within 24 hours, payment is automatically authorized from the card on file. Once approved or auto-approved, charges are final.',
  },
  {
    title: '7. Disputes',
    body:  'Customers may raise a dispute before payment is processed. Tradease will mediate disputes within 2 business days of submission. Tradease\'s decision in disputes is final. Submitting a false or frivolous dispute may result in account suspension. Disputes cannot be raised after payment has been fully processed.',
  },
  {
    title: '8. Prohibited Conduct',
    body:  'You agree not to use Tradease to: (a) post false or misleading information; (b) solicit off-platform payments to avoid fees; (c) harass, threaten, or discriminate against other users; (d) reverse-engineer or misuse the App; (e) violate any applicable law or regulation. Violations may result in immediate account termination.',
  },
  {
    title: '9. Limitation of Liability',
    body:  'To the fullest extent permitted by law, Tradease shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App, including but not limited to damages arising from contractor performance, property damage, or personal injury. Our total liability shall not exceed the fees paid by you in the 90 days preceding the claim.',
  },
  {
    title: '10. Indemnification',
    body:  'You agree to indemnify and hold harmless Tradease Inc., its officers, directors, employees, and agents from any claims, liabilities, damages, or expenses (including legal fees) arising from your use of the App, your violation of these Terms, or your interaction with other users.',
  },
  {
    title: '11. Termination',
    body:  'Tradease reserves the right to suspend or terminate your account at any time for any reason, including violation of these Terms. You may delete your account at any time by contacting support@tradease.app. Upon termination, all licenses granted to you immediately expire.',
  },
  {
    title: '12. Governing Law',
    body:  'These Terms are governed by the laws of the State of New York, without regard to conflict of law principles. Any disputes shall be resolved in the state or federal courts located in New York County, New York.',
  },
  {
    title: '13. Contact',
    body:  'Questions about these Terms? Contact us at: legal@tradease.app or Tradease Inc., 123 Trade Street, New York, NY 10001.',
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Service</Text>
        <View style={{ width:36 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Effective date */}
        <View style={s.effectiveCard}>
          <Ionicons name="document-text-outline" size={18} color={C.primary} />
          <View>
            <Text style={s.effectiveLabel}>Effective Date</Text>
            <Text style={s.effectiveDate}>May 25, 2026</Text>
          </View>
        </View>

        <Text style={s.intro}>
          Please read these Terms of Service carefully before using Tradease. They explain your rights,
          responsibilities, and our policies around payments, disputes, and contractor verification.
        </Text>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerText}>
            By using Tradease, you acknowledge that you have read, understood, and agree to these Terms of Service.
          </Text>
          <Text style={s.footerContact}>legal@tradease.app</Text>
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
  intro:          { fontSize:TY.base, color:C.textSecondary, lineHeight:24, marginBottom:SP[6] },
  section:        { marginBottom:SP[6] },
  sectionTitle:   { fontSize:TY.base, fontWeight:'700', color:C.primary, marginBottom:SP[3] },
  sectionBody:    { fontSize:TY.sm, color:C.textSecondary, lineHeight:22 },
  footer:         { backgroundColor:C.surface, borderRadius:R.lg, padding:SP[5], marginTop:SP[4], borderWidth:0.5, borderColor:C.border, gap:SP[2] },
  footerText:     { fontSize:TY.sm, color:C.textSecondary, lineHeight:20, textAlign:'center' },
  footerContact:  { fontSize:TY.sm, color:C.primary, fontWeight:'600', textAlign:'center' },
});