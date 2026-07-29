import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, AppColors } from '@/context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Spacing } from '../../constants/Layout';
import { Font, Radius } from '../../constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRADES = [
  'Electrician', 'Plumber', 'HVAC', 'General Contractor', 'Carpenter',
  'Painter', 'Roofer', 'Landscaper', 'Flooring', 'Handyman', 'Welder',
  'Cleaner', 'Mechanic',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY',
];

const LIABILITY_TERMS = `By submitting for verification, you ("Contractor") agree to the following:

1. INDEPENDENT CONTRACTOR
You are an independent contractor, not an employee of Tradease. You are solely responsible for your work, taxes, licensing, and compliance with all applicable laws and regulations.

2. LICENSING & INSURANCE
You represent that all license and insurance information submitted is accurate, current, and valid. You agree to maintain valid liability insurance throughout your active period on the platform and notify Tradease of any lapses.

3. LIABILITY
Tradease is not liable for any damages, injuries, losses, or claims arising from your work or interactions with customers. You indemnify and hold harmless Tradease, its officers, and employees from any claims arising from services you provide.

4. QUALITY STANDARDS
You agree to perform all work in a professional, workmanlike manner, honor all commitments made to customers, and maintain the standards expected of a licensed professional in your trade.

5. PLATFORM RULES
Tradease reserves the right to suspend or permanently terminate your account for violation of these terms, fraud, misrepresentation, failure to complete accepted jobs, or conduct deemed harmful to customers or the platform.

6. DATA USE
You consent to Tradease using your submitted information to verify credentials, display your public profile to potential customers, and communicate with you regarding platform activity.

Checking the box confirms you have read, understood, and agree to these terms in full.`;

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    flex: { flex: 1 },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
      paddingBottom: Spacing.sm, gap: 12,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 20, fontWeight: Font.black, color: C.textPrimary },

    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

    heroBox: {
      backgroundColor: C.surface, borderRadius: Radius.xl,
      borderWidth: 1, borderColor: C.border,
      padding: Spacing.lg, marginBottom: Spacing.lg,
      alignItems: 'center', gap: 8,
    },
    heroIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: 'rgba(255,98,0,0.10)',
      borderWidth: 1, borderColor: 'rgba(255,98,0,0.25)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    heroTitle: { fontSize: 22, fontWeight: Font.black, color: C.textPrimary, textAlign: 'center' },
    heroSub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: '85%' },

    sectionHeader: {
      flexDirection: 'row', alignItems: 'center',
      gap: 8, marginTop: Spacing.lg, marginBottom: Spacing.sm,
    },
    sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },
    sectionTitle: { fontSize: 11, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 1.5 },

    field: { marginBottom: Spacing.md },
    fieldLabel: { fontSize: 12, fontWeight: Font.semibold, color: C.textSecondary, marginBottom: 6, letterSpacing: 0.3 },
    input: {
      height: 50, backgroundColor: C.surface, borderRadius: Radius.md,
      borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, fontSize: 15, color: C.textPrimary,
    },
    inputMulti: { height: 88, paddingTop: 12, textAlignVertical: 'top' },
    fieldRow: { flexDirection: 'row', gap: 10 },

    pickerBtn: {
      height: 50, backgroundColor: C.surface, borderRadius: Radius.md,
      borderWidth: 1, borderColor: C.border, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    pickerBtnFilled: { borderColor: C.orange },
    pickerBtnText: { fontSize: 15, color: C.textMuted },
    pickerBtnTextFilled: { color: C.textPrimary },

    pickerSheet: {
      backgroundColor: C.surfaceAlt, borderRadius: Radius.md,
      borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginTop: 4,
    },
    pickerScroll: { maxHeight: 200 },
    pickerRow: {
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: C.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    pickerRowSelected: { backgroundColor: C.orangeDim },
    pickerRowText: { fontSize: 14, color: C.textPrimary },
    pickerRowTextSelected: { color: C.orange, fontWeight: Font.bold },

    uploadBtn: {
      height: 76, backgroundColor: C.surface, borderRadius: Radius.md,
      borderWidth: 2, borderColor: C.border, borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'row',
    },
    uploadBtnDone: { borderStyle: 'solid', borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.05)' },
    uploadBtnText: { fontSize: 13, color: C.textMuted, fontWeight: Font.semibold },
    uploadBtnTextDone: { color: '#22C55E' },
    uploadPreview: {
      width: '100%', height: 80, borderRadius: Radius.md,
      borderWidth: 1, borderColor: '#22C55E',
    },

    termsCard: {
      backgroundColor: C.surface, borderRadius: Radius.lg,
      borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    },
    termsScroll: { maxHeight: 150, padding: Spacing.md },
    termsText: { fontSize: 12, color: C.textSecondary, lineHeight: 20 },
    termsAgreeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: Spacing.md, borderTopWidth: 1, borderTopColor: C.border,
    },
    checkbox: {
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 2, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: C.orange, borderColor: C.orange },
    agreeLabel: { flex: 1, fontSize: 13, fontWeight: Font.semibold, color: C.textPrimary },

    footerBox: { paddingTop: Spacing.lg, gap: 12 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2, backgroundColor: C.orange },
    progressLabel: { fontSize: 11, color: C.textMuted, width: 32, textAlign: 'right' },

    verifyBtn: {
      height: 56, borderRadius: Radius.lg,
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 10,
    },
    verifyBtnOn: { backgroundColor: C.orange },
    verifyBtnOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    verifyBtnTextOn: { fontSize: 16, fontWeight: Font.black, color: C.background },
    verifyBtnTextOff: { fontSize: 16, fontWeight: Font.black, color: C.textMuted },

    footerNote: { fontSize: 12, color: C.textMuted, textAlign: 'center', lineHeight: 18 },
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractorOnboarding() {
  const { colors: C } = useTheme();
  const S = createStyles(C);
  const router = useRouter();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Business info
  const [companyName, setCompanyName] = useState('');
  const [trade, setTrade] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  // Profile
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  // License
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [licenseExpiration, setLicenseExpiration] = useState('');

  // Service area & insurance & terms
  const [serviceArea, setServiceArea] = useState('');
  const [insuranceUri, setInsuranceUri] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Picker visibility
  const [showTradePicker, setShowTradePicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  // ─── Progress ──────────────────────────────────────────────────────────────

  const checks = [
    companyName.trim().length > 1,
    trade.length > 0,
    phone.trim().length > 6,
    location.trim().length > 2,
    description.trim().length > 10,
    hourlyRate.trim().length > 0,
    licenseNumber.trim().length > 3,
    licenseState.length === 2,
    licenseExpiration.trim().length > 0,
    serviceArea.trim().length > 5,
    insuranceUri.length > 0,
    agreedToTerms,
  ];
  const filled = checks.filter(Boolean).length;
  const progress = filled / checks.length;
  const canSubmit = filled === checks.length;

  // ─── Pick insurance doc ────────────────────────────────────────────────────

  const pickInsurance = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload your insurance document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setInsuranceUri(result.assets[0].uri);
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('contractors').insert({
        id: user.id,
        email: user.email,
        company_name: companyName.trim(),
        trade_type: trade,
        phone: phone.trim(),
        location: location.trim(),
        description: description.trim(),
        hourly_rate: parseFloat(hourlyRate) || 0,
        license_number: licenseNumber.trim(),
        license_state: licenseState,
        license_expiration: licenseExpiration.trim(),
        service_area: serviceArea.trim(),
        username: user.email?.split('@')[0],
        plan: 'free',
        approved: false,
        verified: false,
        verification_status: 'pending_review',
        verification_submitted_at: new Date().toISOString(),
        agreed_to_liability: true,
        agreed_to_liability_at: new Date().toISOString(),
      });
      if (error) throw error;
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.flex}>

        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={S.headerTitle}>Contractor Setup</Text>
        </View>

        <ScrollView
          contentContainerStyle={S.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={S.heroBox}>
            <View style={S.heroIcon}>
              <Image
                source={require('../../assets/hammer-icon.png')}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </View>
            <Text style={S.heroTitle}>Build Your Profile</Text>
            <Text style={S.heroSub}>
              Complete every section to unlock your verification badge and start receiving jobs on Tradease.
            </Text>
          </View>

          {/* ── Business Information ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>BUSINESS INFORMATION</Text>
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>COMPANY / BUSINESS NAME</Text>
            <TextInput
              style={S.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="e.g. Rodriguez Electric LLC"
              placeholderTextColor={C.textMuted}
            />
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>TRADE TYPE</Text>
            <TouchableOpacity
              style={[S.pickerBtn, trade ? S.pickerBtnFilled : null]}
              onPress={() => { setShowTradePicker(!showTradePicker); setShowStatePicker(false); }}
              activeOpacity={0.8}
            >
              <Text style={[S.pickerBtnText, trade ? S.pickerBtnTextFilled : null]}>
                {trade || 'Select your trade...'}
              </Text>
              <Ionicons name={showTradePicker ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
            </TouchableOpacity>
            {showTradePicker && (
              <View style={S.pickerSheet}>
                <ScrollView style={S.pickerScroll} nestedScrollEnabled>
                  {TRADES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[S.pickerRow, trade === t && S.pickerRowSelected]}
                      onPress={() => { setTrade(t); setShowTradePicker(false); }}
                    >
                      <Text style={[S.pickerRowText, trade === t && S.pickerRowTextSelected]}>{t}</Text>
                      {trade === t && <Ionicons name="checkmark" size={16} color={C.orange} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>PHONE NUMBER</Text>
            <TextInput
              style={S.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 000-0000"
              placeholderTextColor={C.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>BUSINESS LOCATION</Text>
            <TextInput
              style={S.input}
              value={location}
              onChangeText={setLocation}
              placeholder="City, State (e.g. Dallas, TX)"
              placeholderTextColor={C.textMuted}
            />
          </View>

          {/* ── Profile Details ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>PROFILE DETAILS</Text>
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>ABOUT YOUR BUSINESS</Text>
            <TextInput
              style={[S.input, S.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your experience, specialties, and what makes your work stand out..."
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>HOURLY RATE (USD)</Text>
            <TextInput
              style={S.input}
              value={hourlyRate}
              onChangeText={setHourlyRate}
              placeholder="e.g. 85"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
          </View>

          {/* ── Contractor License ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>CONTRACTOR LICENSE</Text>
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>LICENSE NUMBER</Text>
            <TextInput
              style={S.input}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="e.g. CONT-123456"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
            />
          </View>

          <View style={S.fieldRow}>
            <View style={[S.field, { flex: 1 }]}>
              <Text style={S.fieldLabel}>LICENSE STATE</Text>
              <TouchableOpacity
                style={[S.pickerBtn, licenseState ? S.pickerBtnFilled : null]}
                onPress={() => { setShowStatePicker(!showStatePicker); setShowTradePicker(false); }}
                activeOpacity={0.8}
              >
                <Text style={[S.pickerBtnText, licenseState ? S.pickerBtnTextFilled : null]}>
                  {licenseState || 'State'}
                </Text>
                <Ionicons name={showStatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
              </TouchableOpacity>
              {showStatePicker && (
                <View style={S.pickerSheet}>
                  <ScrollView style={S.pickerScroll} nestedScrollEnabled>
                    {US_STATES.map((st) => (
                      <TouchableOpacity
                        key={st}
                        style={[S.pickerRow, licenseState === st && S.pickerRowSelected]}
                        onPress={() => { setLicenseState(st); setShowStatePicker(false); }}
                      >
                        <Text style={[S.pickerRowText, licenseState === st && S.pickerRowTextSelected]}>{st}</Text>
                        {licenseState === st && <Ionicons name="checkmark" size={16} color={C.orange} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={[S.field, { flex: 1 }]}>
              <Text style={S.fieldLabel}>EXPIRATION</Text>
              <TextInput
                style={S.input}
                value={licenseExpiration}
                onChangeText={setLicenseExpiration}
                placeholder="MM/YYYY"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                maxLength={7}
              />
            </View>
          </View>

          {/* ── Service Area ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>SERVICE AREA</Text>
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>WHERE DO YOU WORK?</Text>
            <TextInput
              style={[S.input, S.inputMulti]}
              value={serviceArea}
              onChangeText={setServiceArea}
              placeholder="e.g. Dallas-Fort Worth metro and suburbs within 30 miles"
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* ── Insurance ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>PROOF OF INSURANCE</Text>
          </View>

          <View style={S.field}>
            <Text style={S.fieldLabel}>INSURANCE CERTIFICATE</Text>
            {insuranceUri ? (
              <TouchableOpacity onPress={pickInsurance} activeOpacity={0.85}>
                <Image source={{ uri: insuranceUri }} style={S.uploadPreview} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={S.uploadBtn} onPress={pickInsurance} activeOpacity={0.7}>
                <Ionicons name="cloud-upload-outline" size={22} color={C.textMuted} />
                <Text style={S.uploadBtnText}>Tap to upload insurance document</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Liability Terms ── */}
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>LIABILITY AGREEMENT</Text>
          </View>

          <View style={[S.field, { marginBottom: Spacing.lg }]}>
            <View style={S.termsCard}>
              <ScrollView style={S.termsScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                <Text style={S.termsText}>{LIABILITY_TERMS}</Text>
              </ScrollView>
              <TouchableOpacity
                style={S.termsAgreeRow}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                activeOpacity={0.7}
              >
                <View style={[S.checkbox, agreedToTerms && S.checkboxChecked]}>
                  {agreedToTerms && <Ionicons name="checkmark" size={14} color={C.background} />}
                </View>
                <Text style={S.agreeLabel}>I agree to the Tradease Liability Terms</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Get Verified CTA ── */}
          <View style={S.footerBox}>
            <View style={S.progressRow}>
              <View style={S.progressTrack}>
                <View style={[S.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={S.progressLabel}>{Math.round(progress * 100)}%</Text>
            </View>

            <TouchableOpacity
              style={[S.verifyBtn, canSubmit ? S.verifyBtnOn : S.verifyBtnOff]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={C.background} />
              ) : (
                <>
                  <Ionicons
                    name="ribbon-outline"
                    size={20}
                    color={canSubmit ? C.background : C.textMuted}
                  />
                  <Text style={canSubmit ? S.verifyBtnTextOn : S.verifyBtnTextOff}>
                    Get Verified
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={S.footerNote}>
              Complete all sections above to unlock this button.{'\n'}
              Verification review takes up to 24 hours — you'll be notified when approved.
            </Text>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
