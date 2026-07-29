// components/VerificationGate.tsx
// Modal shown to contractors who are not yet verified.
// Two states: not_submitted (nudge to apply) and pending_review (wait patiently).
// Cannot be dismissed — contractor must take action or stay on a read-only view.

import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

type GateStatus = 'not_submitted' | 'pending_review';

interface Props {
  visible: boolean;
  status: GateStatus;
  companyName?: string;
}

const REQUIREMENTS = [
  { icon: 'ribbon-outline',      text: 'Valid trade license number + state' },
  { icon: 'calendar-outline',    text: 'License expiration date' },
  { icon: 'location-outline',    text: 'Service area description' },
  { icon: 'shield-outline',      text: 'Proof of insurance document' },
  { icon: 'document-text-outline', text: 'Agree to Tradease Liability Terms' },
];

export default function VerificationGate({ visible, status, companyName }: Props) {
  const router = useRouter();
  const { colors: C, isDark } = useTheme();
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  const isNotSubmitted = status === 'not_submitted';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Scrim */}
      <View style={[styles.scrim, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]}>
        <Animated.View
          style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={[styles.heroIcon, {
                backgroundColor: isNotSubmitted ? 'rgba(255,98,0,0.12)' : 'rgba(251,191,36,0.12)',
                borderColor:     isNotSubmitted ? 'rgba(255,98,0,0.3)'  : 'rgba(251,191,36,0.3)',
              }]}>
                <Ionicons
                  name={isNotSubmitted ? 'ribbon-outline' : 'time-outline'}
                  size={40}
                  color={isNotSubmitted ? C.orange : '#FBBF24'}
                />
              </View>

              <Text style={[styles.heroTitle, { color: C.textPrimary }]}>
                {isNotSubmitted
                  ? 'Get Verified to Start Getting Jobs'
                  : 'Verification in Progress'}
              </Text>
              <Text style={[styles.heroSub, { color: C.textSecondary }]}>
                {isNotSubmitted
                  ? `Welcome to Tradease${companyName ? `, ${companyName}` : ''}! To access the job feed and start earning, you need to complete verification first.`
                  : `Your application is being reviewed by our team. We verify every contractor carefully to protect customers and maintain quality. Sit tight — we'll notify you the moment you're approved.`
                }
              </Text>
            </View>

            {/* Not submitted — show requirements */}
            {isNotSubmitted && (
              <View style={[styles.requirementsBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <Text style={[styles.requirementsTitle, { color: C.textSecondary }]}>
                  WHAT YOU'LL NEED
                </Text>
                {REQUIREMENTS.map((r, i) => (
                  <View key={i} style={styles.requirementRow}>
                    <View style={[styles.requirementIcon, { backgroundColor: 'rgba(255,98,0,0.10)' }]}>
                      <Ionicons name={r.icon as any} size={15} color={C.orange} />
                    </View>
                    <Text style={[styles.requirementText, { color: C.textPrimary }]}>{r.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Pending — show timeline */}
            {!isNotSubmitted && (
              <View style={[styles.timelineBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                {[
                  { icon:'checkmark-circle', color:'#22C55E', label:'Application submitted',    done: true  },
                  { icon:'time',             color:'#FBBF24', label:'Under review — usually 24h', done: false },
                  { icon:'notifications',    color: C.textMuted, label:'You get notified when approved', done: false },
                  { icon:'flash',            color: C.textMuted, label:'Full access to job feed',         done: false },
                ].map((step, i) => (
                  <View key={i} style={styles.timelineRow}>
                    <View style={{ alignItems:'center', width: 28 }}>
                      <Ionicons name={step.icon as any} size={20} color={step.color} />
                      {i < 3 && <View style={[styles.timelineLine, { backgroundColor: i < 1 ? '#22C55E40' : C.border }]} />}
                    </View>
                    <Text style={[styles.timelineText, { color: step.done ? C.textPrimary : C.textSecondary }]}>
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* CTA */}
            {isNotSubmitted ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: C.orange }]}
                  onPress={() => router.push('/profile/get-verified')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="ribbon-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Start Verification</Text>
                </TouchableOpacity>
                <Text style={[styles.estimateText, { color: C.textMuted }]}>
                  Takes about 5 minutes · Reviewed within 24 hours
                </Text>
              </>
            ) : (
              <>
                <View style={[styles.pendingNote, { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' }]}>
                  <Ionicons name="information-circle-outline" size={15} color="#FBBF24" />
                  <Text style={[styles.pendingNoteText, { color: '#FBBF24' }]}>
                    Approvals happen Monday–Friday. If it's been over 48 hours, contact support@tradease.app.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: C.border }]}
                  onPress={() => router.push('/profile/contact')}
                >
                  <Text style={[styles.secondaryBtnText, { color: C.textSecondary }]}>Contact Support</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Legal note */}
            <View style={[styles.legalBox, { borderColor: C.border }]}>
              <Ionicons name="shield-checkmark-outline" size={13} color={C.textMuted} />
              <Text style={[styles.legalText, { color: C.textMuted }]}>
                Verification protects customers and helps contractors build trust. All submitted documents are reviewed by Tradease staff and stored securely.
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim:            { flex:1, justifyContent:'flex-end' },
  sheet:            { borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:0.5, borderLeftWidth:0.5, borderRightWidth:0.5, paddingTop:10, paddingHorizontal:20, maxHeight:'90%' },
  handle:           { width:36, height:4, borderRadius:2, alignSelf:'center', marginBottom:20 },
  hero:             { alignItems:'center', marginBottom:24 },
  heroIcon:         { width:88, height:88, borderRadius:44, borderWidth:1, alignItems:'center', justifyContent:'center', marginBottom:18 },
  heroTitle:        { fontSize:22, fontWeight:'800', textAlign:'center', marginBottom:10, letterSpacing:-0.3 },
  heroSub:          { fontSize:14, textAlign:'center', lineHeight:22 },
  requirementsBox:  { borderRadius:16, borderWidth:0.5, padding:16, marginBottom:24, gap:12 },
  requirementsTitle:{ fontSize:11, fontWeight:'700', letterSpacing:0.8, marginBottom:4 },
  requirementRow:   { flexDirection:'row', alignItems:'center', gap:12 },
  requirementIcon:  { width:30, height:30, borderRadius:8, alignItems:'center', justifyContent:'center' },
  requirementText:  { fontSize:14, fontWeight:'500', flex:1 },
  timelineBox:      { borderRadius:16, borderWidth:0.5, padding:16, marginBottom:24, gap:0 },
  timelineRow:      { flexDirection:'row', alignItems:'flex-start', gap:12, paddingBottom:4 },
  timelineLine:     { width:1, height:20, marginTop:4 },
  timelineText:     { fontSize:14, paddingTop:2, flex:1 },
  primaryBtn:       { borderRadius:14, paddingVertical:16, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, marginBottom:10 },
  primaryBtnText:   { fontSize:16, fontWeight:'800', color:'#fff' },
  estimateText:     { fontSize:12, textAlign:'center', marginBottom:20 },
  pendingNote:      { flexDirection:'row', gap:10, borderRadius:12, borderWidth:1, padding:14, marginBottom:14, alignItems:'flex-start' },
  pendingNoteText:  { flex:1, fontSize:13, lineHeight:19 },
  secondaryBtn:     { borderRadius:14, paddingVertical:14, alignItems:'center', borderWidth:1, marginBottom:20 },
  secondaryBtnText: { fontSize:15, fontWeight:'600' },
  legalBox:         { flexDirection:'row', gap:8, borderTopWidth:0.5, paddingTop:16, alignItems:'flex-start' },
  legalText:        { flex:1, fontSize:11, lineHeight:17 },
});