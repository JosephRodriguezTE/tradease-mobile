// app/profile/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SUPPORT_EMAIL } from '../../constants/contact';

const C = {
  bg:'#0A0A0F', surface:'#13131A', border:'#2A2A38',
  primary:'#F5A623', primaryMuted:'rgba(245,166,35,0.12)',
  textPrimary:'#F0F0F5', textSecondary:'#9090A8', textTertiary:'#5A5A70',
};
const SP = { 2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { md:10,lg:16 } as const;
const TY = { xs:11,sm:13,base:15,md:17,xl:24 } as const;

// Mirrors the website Terms (app/terms/page.tsx in the website repo) word
// for word, including its DRAFT status. Change both together.
interface Section { title: string; body?: string[]; bullets?: string[]; after?: string; }

const SECTIONS: Section[] = [
  {
    title: '1. Tradease Is a Marketplace, Not a Contractor',
    body: [
      'Tradease Inc. (\u201cTradease,\u201d \u201cwe,\u201d \u201cus\u201d) operates an online marketplace platform that connects customers seeking home-service work with independent contractors offering that work, currently serving Nassau and Suffolk County, New York.',
      'Tradease is not a contractor, home-improvement business, or employer, and is not a party to any agreement for work between a customer and a contractor. We do not perform, supervise, or guarantee any repair, installation, or other service booked through the platform. Our role is limited to facilitating discovery, communication, scheduling, and payment between independent parties.',
    ],
  },
  {
    title: '2. Independent Contractors',
    body: ['Contractors who list services on Tradease are independent businesses or individuals, not employees, agents, or representatives of Tradease. Each contractor is solely responsible for:'],
    bullets: [
      'Holding any license required to perform home-improvement work in New York State and complying with all applicable licensing laws in the county where the work is performed;',
      'Carrying adequate insurance, including liability and, where applicable, workers\u2019 compensation coverage;',
      'The quality, safety, legality, and timeliness of their own work;',
      'Their own tax, employment, and business obligations.',
    ],
    after: 'Tradease reviews contractor-submitted documentation as part of onboarding but does not independently verify licensure or insurance with issuing authorities, and does not guarantee that any contractor is licensed, insured, or qualified for a given job.',
  },
  {
    title: '3. Eligibility',
    body: ['You must be at least 18 years old and able to form a binding contract to create an account, book a job, or offer services on Tradease. By using Tradease you represent that you meet these requirements.'],
  },
  {
    title: '4. Fees',
    body: ['Customers pay the price agreed with the contractor for a job plus a Tradease service/protection fee, disclosed before checkout. This fee compensates Tradease for operating the platform, payment processing, and support, and is separate from anything owed to the contractor for their labor or materials.'],
  },
  {
    title: '5. No Guarantee of Work Quality or Outcomes',
    body: ['Tradease does not warrant or guarantee the quality, outcome, safety, or legality of any work performed by a contractor found through the platform. Any dispute about the work itself is between the customer and the contractor. Tradease provides tools \u2014 messaging, a dispute-flagging process, and review of submitted evidence \u2014 to help resolve disagreements, but does not adjudicate contract or construction-defect claims and is not liable for the outcome of the underlying work.'],
  },
  {
    title: '6. Disputes Between Users',
    body: ['If a customer and contractor disagree about a job, either party may open a dispute through the platform. Tradease may review submitted messages, photos, and payment records to help reach a resolution regarding funds held on the platform, but this process is offered as a courtesy and does not replace any legal remedy either party may have against the other.'],
  },
  {
    title: '7. Account Rules & Termination',
    body: ['You agree to provide accurate account information, keep your login credentials secure, and use the platform lawfully. Tradease may suspend or terminate any account that violates these Terms, engages in fraud, harasses another user, or circumvents the platform to avoid fees. You may close your account at any time.'],
  },
  {
    title: '8. Limitation of Liability',
    body: ['To the fullest extent permitted by law, Tradease\u2019s total liability arising out of or relating to your use of the platform is limited to the fees you paid to Tradease in the twelve months before the claim arose. Tradease is not liable for indirect, incidental, or consequential damages, or for the acts or omissions of any contractor or customer.'],
  },
  {
    title: '9. Governing Law',
    body: ['These Terms are governed by the laws of the State of New York, without regard to conflict-of-law principles, and any dispute with Tradease will be subject to the exclusive jurisdiction of the state and federal courts located in New York.'],
  },
  {
    title: '10. Changes to These Terms',
    body: ['We may update these Terms as Tradease evolves. Material changes will be reflected on this page with an updated date above.'],
  },
  {
    title: '11. Contact',
    body: [`Questions about these Terms can be sent to ${SUPPORT_EMAIL}.`],
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
            <Text style={s.effectiveLabel}>Last Updated</Text>
            <Text style={s.effectiveDate}>August 2026</Text>
          </View>
        </View>

        <View style={s.draftCard}>
          <Text style={s.draftText}>
            DRAFT — pending legal review, not final. This page is placeholder policy text
            published so users have something real to read while our attorney finalizes the
            binding version. It is not yet legally reviewed and may change.
          </Text>
        </View>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            {sec.body?.map(p => <Text key={p} style={[s.sectionBody, s.para]}>{p}</Text>)}
            {sec.bullets?.map(b => (
              <Text key={b} style={[s.sectionBody, s.bullet]}>{'\u2022  '}{b}</Text>
            ))}
            {sec.after && <Text style={[s.sectionBody, s.para]}>{sec.after}</Text>}
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerText}>Questions about these Terms?</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            <Text style={s.footerContact}>{SUPPORT_EMAIL}</Text>
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
  draftCard:      { backgroundColor:'rgba(255,98,0,0.08)', borderRadius:R.md, borderWidth:1, borderColor:'rgba(255,98,0,0.3)', padding:SP[4], marginBottom:SP[6] },
  draftText:      { fontSize:TY.sm, color:'#FF6200', fontWeight:'700', lineHeight:20 },
  para:           { marginBottom:SP[2] },
  bullet:         { marginBottom:SP[2], paddingLeft:SP[2] },
  section:        { marginBottom:SP[6] },
  sectionTitle:   { fontSize:TY.base, fontWeight:'700', color:C.primary, marginBottom:SP[3] },
  sectionBody:    { fontSize:TY.sm, color:C.textSecondary, lineHeight:22 },
  footer:         { backgroundColor:C.surface, borderRadius:R.lg, padding:SP[5], marginTop:SP[4], borderWidth:0.5, borderColor:C.border, gap:SP[2] },
  footerText:     { fontSize:TY.sm, color:C.textSecondary, lineHeight:20, textAlign:'center' },
  footerContact:  { fontSize:TY.sm, color:C.primary, fontWeight:'600', textAlign:'center' },
});