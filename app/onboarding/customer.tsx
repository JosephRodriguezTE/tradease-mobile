import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Colors, Font, Radius } from '../../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

// NY County detector from coordinates
function detectNYCounty(lat: number, lng: number): string {
  if (lat >= 40.48 && lat <= 40.92 && lng >= -74.26 && lng <= -73.70) {
    if (lat >= 40.70 && lat <= 40.80 && lng >= -74.02 && lng <= -73.97) return 'New York County (Manhattan)';
    if (lat >= 40.63 && lat <= 40.74 && lng >= -74.04 && lng <= -73.83) return 'Kings County (Brooklyn)';
    if (lat >= 40.54 && lat <= 40.74 && lng >= -73.97 && lng <= -73.70) return 'Queens County';
    if (lat >= 40.78 && lat <= 40.92 && lng >= -73.93 && lng <= -73.75) return 'Bronx County';
    if (lat >= 40.48 && lat <= 40.65 && lng >= -74.26 && lng <= -74.05) return 'Richmond County (Staten Island)';
    if (lat >= 40.60 && lat <= 41.00 && lng >= -74.10 && lng <= -73.65) return 'Nassau County';
    if (lat >= 40.90 && lat <= 41.40 && lng >= -74.10 && lng <= -73.65) return 'Westchester County';
    return 'New York Area';
  }
  return 'New York Area';
}

const STEPS = ['Personal Info', 'Address', 'Review'];

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepCircle, i <= current && styles.stepCircleActive]}>
            {i < current ? (
              <Text style={styles.stepCheck}>✓</Text>
            ) : (
              <Text style={[styles.stepNum, i === current && styles.stepNumActive]}>
                {i + 1}
              </Text>
            )}
          </View>
          <Text style={[styles.stepLabel, i === current && styles.stepLabelActive]}>
            {label}
          </Text>
          {i < STEPS.length - 1 && (
            <View style={[styles.stepLine, i < current && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={styles.fieldRequired}> *</Text>}
    </Text>
  );
}

import { TextInput } from 'react-native';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  required,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.fieldContainer}>
      <FieldLabel label={label} required={required} />
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        selectionColor={Colors.orange}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      />
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

export default function CustomerOnboarding() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Step 1 — Personal info
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email] = useState(user?.email ?? '');

  // Step 2 — Address
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('NY');
  const [zipCode, setZipCode] = useState('');
  const [county, setCounty] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location access in Settings to auto-detect your address.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;
      setLat(latitude);
      setLng(longitude);

      // Reverse geocode
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (address) {
        setStreetAddress(`${address.streetNumber ?? ''} ${address.street ?? ''}`.trim());
        setCity(address.city ?? address.subregion ?? '');
        setState(address.region ?? 'NY');
        setZipCode(address.postalCode ?? '');
        setCounty(detectNYCounty(latitude, longitude));
      }
    } catch (err) {
      Alert.alert('Location Error', 'Could not detect location. Please enter manually.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const validateStep = () => {
    if (step === 0) {
      if (!fullName.trim()) { Alert.alert('Required', 'Please enter your full name.'); return false; }
      if (!phone.trim()) { Alert.alert('Required', 'Please enter your phone number.'); return false; }
    }
    if (step === 1) {
      if (!streetAddress.trim()) { Alert.alert('Required', 'Please enter your street address.'); return false; }
      if (!city.trim()) { Alert.alert('Required', 'Please enter your city.'); return false; }
      if (!zipCode.trim()) { Alert.alert('Required', 'Please enter your ZIP code.'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const fullAddress = `${streetAddress}, ${city}, ${state} ${zipCode}`;

      const { error } = await supabase.from('users').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        phone: phone.trim(),
        location: county || city,
        username: user.email?.split('@')[0],
        role: 'customer',
      });

      if (error) throw error;

      // Save address to auth metadata for easy access
      await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          address: fullAddress,
          street_address: streetAddress.trim(),
          city: city.trim(),
          state: state.trim(),
          zip_code: zipCode.trim(),
          county: county,
          lat,
          lng,
          role: 'customer',
        },
      });

      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create Your Account</Text>
          <Text style={styles.headerSub}>Step {step + 1} of {STEPS.length}</Text>
        </View>
        <StepIndicator current={step} />
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Step 0: Personal Info ── */}
          {step === 0 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Tell us about yourself</Text>
              <Text style={styles.stepSub}>
                This information helps contractors know who they're working with.
              </Text>

              <View style={styles.card}>
                <Field
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Jane Smith"
                  required
                />
                <View style={styles.divider} />
                <Field
                  label="Phone Number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 (555) 000-0000"
                  keyboardType="phone-pad"
                  required
                  hint="Used for booking confirmations only"
                />
                <View style={styles.divider} />
                <View style={styles.fieldContainer}>
                  <FieldLabel label="Email Address" />
                  <View style={styles.emailDisplay}>
                    <Text style={styles.emailText}>{email}</Text>
                    <Text style={styles.emailLock}>🔒</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── Step 1: Address ── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Your location</Text>
              <Text style={styles.stepSub}>
                Your address is used to auto-fill bookings and find contractors near you. It is never shown publicly — only your county is visible.
              </Text>

              {/* Auto-detect button */}
              <TouchableOpacity
                style={styles.detectBtn}
                onPress={detectLocation}
                disabled={detectingLocation}
                activeOpacity={0.8}
              >
                {detectingLocation ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.detectIcon}>📍</Text>
                )}
                <Text style={styles.detectText}>
                  {detectingLocation ? 'Detecting your location...' : 'Auto-Detect My Location'}
                </Text>
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or enter manually</Text>
                <View style={styles.orLine} />
              </View>

              <View style={styles.card}>
                <Field
                  label="Street Address"
                  value={streetAddress}
                  onChangeText={setStreetAddress}
                  placeholder="123 Main Street, Apt 4B"
                  required
                />
                <View style={styles.divider} />

                <View style={styles.rowFields}>
                  <View style={styles.rowFieldLarge}>
                    <Field
                      label="City"
                      value={city}
                      onChangeText={setCity}
                      placeholder="Brooklyn"
                      required
                    />
                  </View>
                  <View style={styles.rowFieldSmall}>
                    <Field
                      label="State"
                      value={state}
                      onChangeText={setState}
                      placeholder="NY"
                    />
                  </View>
                </View>

                <View style={styles.divider} />
                <Field
                  label="ZIP Code"
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="11201"
                  keyboardType="numeric"
                  required
                />

                {county ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.countyRow}>
                      <Text style={styles.countyIcon}>🗺️</Text>
                      <View>
                        <Text style={styles.countyLabel}>Detected County</Text>
                        <Text style={styles.countyValue}>{county}</Text>
                      </View>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.privacyNote}>
                <Text style={styles.privacyIcon}>🔒</Text>
                <Text style={styles.privacyText}>
                  Your full address is private. Only your county is shown on your public profile.
                </Text>
              </View>
            </View>
          )}

          {/* ── Step 2: Review ── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Confirm your details</Text>
              <Text style={styles.stepSub}>
                Review your information before creating your account.
              </Text>

              <View style={styles.card}>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewIcon}>👤</Text>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewLabel}>Full Name</Text>
                    <Text style={styles.reviewValue}>{fullName}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewIcon}>📱</Text>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewLabel}>Phone</Text>
                    <Text style={styles.reviewValue}>{phone}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewIcon}>📧</Text>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewLabel}>Email</Text>
                    <Text style={styles.reviewValue}>{email}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewIcon}>📍</Text>
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewLabel}>Address</Text>
                    <Text style={styles.reviewValue}>
                      {streetAddress}{'\n'}{city}, {state} {zipCode}
                    </Text>
                  </View>
                </View>
                {county && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewIcon}>🗺️</Text>
                      <View style={styles.reviewInfo}>
                        <Text style={styles.reviewLabel}>County (Public)</Text>
                        <Text style={styles.reviewValue}>{county}</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.termsNote}>
                <Text style={styles.termsText}>
                  By creating your account you agree to the{' '}
                  <Text style={styles.termsLink}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer buttons */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step < STEPS.length - 1 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>Continue →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.nextBtnText}>Create Account 🎉</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  headerSafe: { backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: Font.black, color: Colors.white },
  headerSub: { fontSize: 13, color: Colors.textSecondary },

  // Steps
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 0,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    position: 'relative',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
  },
  stepNum: { fontSize: 12, fontWeight: Font.bold, color: Colors.textMuted },
  stepNumActive: { color: Colors.background },
  stepCheck: { fontSize: 12, color: Colors.background, fontWeight: Font.black },
  stepLabel: { fontSize: 10, color: Colors.textMuted, marginLeft: 4 },
  stepLabelActive: { color: Colors.orange, fontWeight: Font.bold },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  stepLineActive: { backgroundColor: Colors.orange },

  // Scroll
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 20,
  },

  // Step content
  stepContent: { gap: Spacing.md },
  stepTitle: {
    fontSize: 24,
    fontWeight: Font.black,
    color: Colors.white,
    marginBottom: 4,
  },
  stepSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border },

  // Fields
  fieldContainer: { padding: Spacing.md, gap: 6 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: Font.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldRequired: { color: Colors.orange },
  input: {
    fontSize: 16,
    color: Colors.white,
    paddingVertical: 4,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  fieldHint: { fontSize: 11, color: Colors.textMuted },
  emailDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailText: { fontSize: 16, color: Colors.textSecondary },
  emailLock: { fontSize: 14 },

  // Row fields
  rowFields: { flexDirection: 'row' },
  rowFieldLarge: { flex: 2, borderRightWidth: 1, borderRightColor: Colors.border },
  rowFieldSmall: { flex: 1 },

  // Location detect
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.orange,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  detectIcon: { fontSize: 20 },
  detectText: { fontSize: 15, fontWeight: Font.bold, color: Colors.background },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: 13, color: Colors.textMuted },

  // County
  countyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.md,
    backgroundColor: Colors.orangeDim,
  },
  countyIcon: { fontSize: 20 },
  countyLabel: { fontSize: 11, color: Colors.orange, fontWeight: Font.semibold },
  countyValue: { fontSize: 14, color: Colors.orange, fontWeight: Font.bold },

  // Privacy
  privacyNote: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'flex-start',
  },
  privacyIcon: { fontSize: 16 },
  privacyText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  // Review
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: Spacing.md,
  },
  reviewIcon: { fontSize: 20, marginTop: 2 },
  reviewInfo: { flex: 1, gap: 3 },
  reviewLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: Font.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue: { fontSize: 15, color: Colors.white, fontWeight: Font.semibold, lineHeight: 22 },

  // Terms
  termsNote: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  termsText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center' },
  termsLink: { color: Colors.orange, fontWeight: Font.semibold },

  // Footer
  footerSafe: { backgroundColor: Colors.background },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  backBtnText: { fontSize: 15, fontWeight: Font.semibold, color: Colors.textPrimary },
  nextBtn: {
    flex: 2,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { fontSize: 15, fontWeight: Font.black, color: Colors.background },
});