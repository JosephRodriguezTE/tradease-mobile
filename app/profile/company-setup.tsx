import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ALL_TRADES } from '@/lib/tradeJobs';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font, Radius } from '../../constants/theme';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function CompanySetupScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [trade, setTrade] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const steps = ['Business Info', 'Trade & Location', 'About'];

  async function handleSave() {
    if (!companyName.trim()) { Alert.alert('Required', 'Enter your company name.'); return; }
    if (!trade) { Alert.alert('Required', 'Select your primary trade.'); return; }
    if (!city.trim() || !state) { Alert.alert('Required', 'Enter your city and state.'); return; }

    setSaving(true);
    const { error } = await supabase
      .from('contractors')
      .update({
        company_name: companyName.trim(),
        trade_type: trade,
        business_city: city.trim(),
        business_state: state,
        location: `${city.trim()}, ${state}`,
        phone: phone.trim() || null,
        description: description.trim() || null,
        onboarding_complete: true,
      })
      .eq('id', user!.id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('All set!', 'Your company profile is ready. Add photos and specialties to attract more customers.', [
      { text: 'Complete Profile', onPress: () => router.replace('/profile/company-profile' as any) },
      { text: 'Later', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
    ]);
  }

  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Company Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress bar */}
      <View style={s.progressRow}>
        {steps.map((label, i) => (
          <View key={label} style={s.progressStep}>
            <View style={[s.progressDot, i <= step && { backgroundColor: C.orange }]}>
              {i < step ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[s.progressDotText, i === step && { color: '#fff' }]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[s.progressLabel, i === step && { color: C.orange }]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {step === 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Business Information</Text>
            <Text style={s.sectionSub}>This is what customers will see when they search for contractors.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Company Name *</Text>
              <TextInput
                style={[s.input, { color: C.textPrimary, borderColor: C.border }]}
                placeholder="e.g. Rodriguez Plumbing LLC"
                placeholderTextColor={C.textMuted}
                value={companyName}
                onChangeText={setCompanyName}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Phone Number</Text>
              <TextInput
                style={[s.input, { color: C.textPrimary, borderColor: C.border }]}
                placeholder="(555) 000-0000"
                placeholderTextColor={C.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Trade & Location</Text>
            <Text style={s.sectionSub}>Select your primary trade and where you work.</Text>

            <Text style={s.label}>Primary Trade *</Text>
            <View style={s.tradeGrid}>
              {ALL_TRADES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.tradePill, trade === t && { backgroundColor: C.orange + '22', borderColor: C.orange }]}
                  onPress={() => setTrade(t)}
                >
                  <Text style={[s.tradePillText, { color: trade === t ? C.orange : C.textSecondary }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.label}>City *</Text>
              <TextInput
                style={[s.input, { color: C.textPrimary, borderColor: C.border }]}
                placeholder="e.g. Miami"
                placeholderTextColor={C.textMuted}
                value={city}
                onChangeText={setCity}
              />
            </View>

            <Text style={s.label}>State *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
                {US_STATES.map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[s.statePill, state === st && { backgroundColor: C.orange + '22', borderColor: C.orange }]}
                    onPress={() => setState(st)}
                  >
                    <Text style={[s.statePillText, { color: state === st ? C.orange : C.textSecondary }]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {step === 2 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>About Your Business</Text>
            <Text style={s.sectionSub}>A brief description helps customers understand what you do and why they should hire you.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.label}>Description (optional)</Text>
              <TextInput
                style={[s.input, s.textarea, { color: C.textPrimary, borderColor: C.border }]}
                placeholder="e.g. Licensed plumber with 10+ years serving Miami-Dade. Specializing in emergency repairs, water heaters, and bathroom remodels."
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={400}
              />
              <Text style={[s.charCount, { color: C.textMuted }]}>{description.length}/400</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Footer nav */}
      <View style={[s.footer, { borderTopColor: C.border }]}>
        {step > 0 && (
          <TouchableOpacity style={[s.backStepBtn, { borderColor: C.border }]} onPress={() => setStep(s => s - 1)}>
            <Text style={[s.backStepText, { color: C.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        )}
        {step < steps.length - 1 ? (
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: C.orange, flex: step > 0 ? 1 : undefined }]}
            onPress={() => {
              if (step === 0 && !companyName.trim()) { Alert.alert('Required', 'Enter your company name.'); return; }
              if (step === 1 && (!trade || !city.trim() || !state)) { Alert.alert('Required', 'Select a trade, city, and state.'); return; }
              setStep(s => s + 1);
            }}
          >
            <Text style={s.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: C.orange, flex: step > 0 ? 1 : undefined }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.nextBtnText}>Save & Continue →</Text>}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: C.background },
    header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: Font.bold, color: C.textPrimary },

    progressRow:    { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 16, paddingHorizontal: 16 },
    progressStep:   { alignItems: 'center', gap: 6 },
    progressDot:    { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    progressDotText:{ fontSize: 12, fontWeight: Font.bold, color: C.textMuted },
    progressLabel:  { fontSize: 11, fontWeight: Font.semibold, color: C.textMuted },

    scroll:         { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
    section:        { gap: 4 },
    sectionTitle:   { fontSize: 22, fontWeight: Font.black, color: C.textPrimary, marginBottom: 4 },
    sectionSub:     { fontSize: 14, color: C.textSecondary, lineHeight: 21, marginBottom: 20 },

    fieldGroup:     { marginBottom: 16 },
    label:          { fontSize: 12, fontWeight: Font.bold, color: C.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
    input:          { backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    textarea:       { minHeight: 110, paddingTop: 12 },
    charCount:      { fontSize: 11, textAlign: 'right', marginTop: 4 },

    tradeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    tradePill:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
    tradePillText:  { fontSize: 13, fontWeight: Font.semibold },

    statePill:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
    statePillText:  { fontSize: 12, fontWeight: Font.bold },

    footer:         { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 0.5 },
    backStepBtn:    { height: 52, paddingHorizontal: 20, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    backStepText:   { fontSize: 15, fontWeight: Font.semibold },
    nextBtn:        { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    nextBtnText:    { fontSize: 16, fontWeight: Font.black, color: '#fff' },
  });
}
