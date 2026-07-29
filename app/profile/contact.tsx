// app/profile/contact.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg:'#0A0A0F', surface:'#13131A', surfaceAlt:'#1C1C26', border:'#2A2A38', borderLight:'#3A3A4E',
  primary:'#F5A623', primaryMuted:'rgba(245,166,35,0.12)',
  success:'#22C55E', successMuted:'rgba(34,197,94,0.12)',
  error:'#EF4444',
  textPrimary:'#F0F0F5', textSecondary:'#9090A8', textTertiary:'#5A5A70',
};
const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:6,md:10,lg:16,full:9999 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24 } as const;

const SUBJECTS = ['General Question','Billing Issue','Dispute Help','Bug Report','Feature Request','Account Help','Other'];

export default function ContactScreen() {
  const router   = useRouter();
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);

  async function handleSend() {
    if (!subject) { Alert.alert('Select a subject', 'Please choose what your message is about.'); return; }
    if (message.trim().length < 20) { Alert.alert('More detail needed', 'Please write at least a sentence so we can help you properly.'); return; }

    setSending(true);
    const mailto = `mailto:joseph.rodriguez.te@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.trim())}`;
    await Linking.openURL(mailto);
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Contact Us</Text>
          <View style={{ width:36 }} />
        </View>
        <View style={s.sentContainer}>
          <View style={s.sentIcon}>
            <Ionicons name="checkmark-circle" size={48} color={C.success} />
          </View>
          <Text style={s.sentTitle}>Message Sent</Text>
          <Text style={s.sentSub}>Your email app should have opened with the message ready. We typically respond within 24 hours.</Text>
          <TouchableOpacity style={s.sentBtn} onPress={() => { setSent(false); setSubject(''); setMessage(''); }}>
            <Text style={s.sentBtnText}>Send Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sentBackBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={s.sentBackText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Contact Us</Text>
          <View style={{ width:36 }} />
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Direct email */}
          <Text style={s.sectionLabel}>CONTACT US DIRECTLY</Text>
          <TouchableOpacity
            style={[s.quickCard, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}
            onPress={() => Linking.openURL('mailto:joseph.rodriguez.te@gmail.com')}
          >
            <Ionicons name="mail" size={24} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.quickLabel}>EMAIL SUPPORT</Text>
              <Text style={[s.quickValue, { textAlign: 'left', fontSize: 14, color: C.primary }]}>
                joseph.rodriguez.te@gmail.com
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={C.primary} />
          </TouchableOpacity>

          {/* Message form */}
          <Text style={[s.sectionLabel, { marginTop:SP[6] }]}>SEND A MESSAGE</Text>
          <View style={s.card}>

            {/* Subject picker */}
            <TouchableOpacity style={s.subjectRow} onPress={() => setSubjectOpen(!subjectOpen)}>
              <Text style={[s.subjectLabel, !subject && { color:C.textTertiary }]}>
                {subject || 'Select a subject'}
              </Text>
              <Ionicons name={subjectOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textTertiary} />
            </TouchableOpacity>

            {subjectOpen && (
              <View style={s.subjectDropdown}>
                {SUBJECTS.map((sub, i) => (
                  <View key={sub}>
                    {i > 0 && <View style={s.dropDivider} />}
                    <TouchableOpacity style={s.dropItem} onPress={() => { setSubject(sub); setSubjectOpen(false); }}>
                      <Text style={[s.dropItemText, subject === sub && { color:C.primary, fontWeight:'700' }]}>{sub}</Text>
                      {subject === sub && <Ionicons name="checkmark" size={16} color={C.primary} />}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={s.cardDivider} />

            {/* Message input */}
            <View style={s.messageBox}>
              <TextInput
                style={s.messageInput}
                placeholder="Describe your issue or question in detail..."
                placeholderTextColor={C.textTertiary}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                maxLength={1000}
              />
              <Text style={s.charCount}>{message.length}/1000</Text>
            </View>
          </View>

          {/* Response time note */}
          <View style={s.noteBox}>
            <Ionicons name="information-circle-outline" size={14} color={C.textTertiary} />
            <Text style={s.noteText}>
              We respond to all messages within 24 hours on business days. For urgent billing or
              dispute issues, include your booking ID for faster resolution.
            </Text>
          </View>

          {/* Send button */}
          <TouchableOpacity
            style={[s.sendBtn, (sending || !subject) && { opacity:0.45 }]}
            onPress={handleSend}
            disabled={sending || !subject}
          >
            {sending
              ? <ActivityIndicator color="#000" size="small" />
              : <><Ionicons name="send" size={18} color="#000" /><Text style={s.sendBtnText}>Send Message</Text></>
            }
          </TouchableOpacity>

          <View style={{ height:SP[10] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:C.bg },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:SP[4], paddingVertical:SP[3], borderBottomWidth:0.5, borderBottomColor:C.border },
  backBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:  { fontSize:TY.md, fontWeight:'700', color:C.textPrimary, letterSpacing:-0.3 },
  scroll:       { flex:1 },
  scrollContent:{ paddingHorizontal:SP[4], paddingTop:SP[4] },
  sectionLabel: { fontSize:TY.xs, fontWeight:'700', color:C.textTertiary, letterSpacing:0.8, marginBottom:SP[3] },

  quickRow:     { flexDirection:'row', gap:SP[3], marginBottom:SP[2] },
  quickCard:    { flex:1, backgroundColor:C.surface, borderRadius:R.lg, borderWidth:0.5, borderColor:C.border, padding:SP[4], alignItems:'center', gap:SP[2] },
  quickLabel:   { fontSize:TY.xs, fontWeight:'700', color:C.textTertiary, letterSpacing:0.5 },
  quickValue:   { fontSize:TY.xs, color:C.textSecondary, textAlign:'center', lineHeight:16 },

  card:         { backgroundColor:C.surface, borderRadius:R.lg, borderWidth:0.5, borderColor:C.border, overflow:'hidden' },
  cardDivider:  { height:0.5, backgroundColor:C.border },

  subjectRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:SP[4] },
  subjectLabel: { fontSize:TY.base, color:C.textPrimary, fontWeight:'500', flex:1 },
  subjectDropdown:{ backgroundColor:C.surfaceAlt, borderTopWidth:0.5, borderTopColor:C.border },
  dropItem:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:SP[4], paddingVertical:SP[4] },
  dropItemText: { fontSize:TY.base, color:C.textPrimary },
  dropDivider:  { height:0.5, backgroundColor:C.border, marginHorizontal:SP[4] },

  messageBox:   { padding:SP[4] },
  messageInput: { fontSize:TY.base, color:C.textPrimary, minHeight:120, lineHeight:22 },
  charCount:    { fontSize:TY.xs, color:C.textTertiary, textAlign:'right', marginTop:SP[2] },

  noteBox:      { flexDirection:'row', gap:SP[2], marginTop:SP[4], padding:SP[4], backgroundColor:C.surface, borderRadius:R.lg, borderWidth:0.5, borderColor:C.border },
  noteText:     { flex:1, fontSize:11, color:C.textTertiary, lineHeight:17 },

  sendBtn:      { backgroundColor:C.primary, borderRadius:R.lg, paddingVertical:SP[4], flexDirection:'row', alignItems:'center', justifyContent:'center', gap:SP[2], marginTop:SP[4] },
  sendBtnText:  { fontSize:TY.md, fontWeight:'700', color:'#000' },

  sentContainer:{ flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:SP[8] },
  sentIcon:     { width:88, height:88, borderRadius:44, backgroundColor:C.successMuted, alignItems:'center', justifyContent:'center', marginBottom:SP[5] },
  sentTitle:    { fontSize:TY.xl, fontWeight:'800', color:C.textPrimary, marginBottom:SP[3] },
  sentSub:      { fontSize:TY.base, color:C.textSecondary, textAlign:'center', lineHeight:22, marginBottom:SP[8] },
  sentBtn:      { backgroundColor:C.primary, borderRadius:R.lg, paddingVertical:SP[4], paddingHorizontal:SP[8], marginBottom:SP[3] },
  sentBtnText:  { fontSize:TY.md, fontWeight:'700', color:'#000' },
  sentBackBtn:  { paddingVertical:SP[3] },
  sentBackText: { fontSize:TY.base, color:C.textTertiary, fontWeight:'600' },
});