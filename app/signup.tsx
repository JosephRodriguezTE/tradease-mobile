import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TradeaseLogo } from '../components/TradeaseLogo';
import {
  ActivityIndicator,
  Alert, Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontFamily, Shadows } from '../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '../lib/supabase';
import { ALL_TRADES, TRADE_ICONS } from '../lib/tradeJobs';

const { width } = Dimensions.get('window');

// Bump this when the Terms of Service / Privacy Policy text changes.
const CURRENT_TOS_VERSION = '2026-08-21';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── FOCUS INPUT ────────────────────────────────────────
function FocusInput({
  label, value, onChangeText, placeholder, secureTextEntry,
  keyboardType, autoCapitalize, autoComplete, required, rightElement, hint, editable = true,
}: any) {
  const [focused, setFocused] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', Colors.orange],
  });

  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>
        {label}{required && <Text style={inputStyles.req}> *</Text>}
      </Text>
      <Animated.View style={[inputStyles.box, { borderColor }, !editable && inputStyles.boxDisabled]}>
        <TextInput
          style={[inputStyles.input, !editable && inputStyles.inputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#3F3F3F"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoComplete={autoComplete}
          selectionColor={Colors.orange}
          editable={editable}
          onFocus={() => { setFocused(true); Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start(); }}
          onBlur={() => { setFocused(false); Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start(); }}
        />
        {rightElement && <View style={inputStyles.right}>{rightElement}</View>}
      </Animated.View>
      {hint && <Text style={inputStyles.hint}>{hint}</Text>}
    </View>
  );
}

// ─── MONTH/YEAR PICKER ──────────────────────────────────
function MonthYearPicker({
  month, year, onSelect,
}: {
  month: number; year: number;
  onSelect: (m: number, y: number) => void;
}) {
  const now = new Date();
  const [displayYear, setDisplayYear] = useState(year || now.getFullYear());

  return (
    <View style={pickerStyles.box}>
      <View style={pickerStyles.yearRow}>
        <TouchableOpacity onPress={() => setDisplayYear(y => y - 1)} style={pickerStyles.yearBtn}>
          <Text style={pickerStyles.yearArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={pickerStyles.yearText}>{displayYear}</Text>
        <TouchableOpacity onPress={() => setDisplayYear(y => y + 1)} style={pickerStyles.yearBtn}>
          <Text style={pickerStyles.yearArrow}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={pickerStyles.monthGrid}>
        {MONTHS.map((m, i) => {
          const isSelected = i + 1 === month && displayYear === year;
          const isPast = new Date(displayYear, i) < new Date(now.getFullYear(), now.getMonth());
          return (
            <TouchableOpacity
              key={m}
              onPress={() => !isPast && onSelect(i + 1, displayYear)}
              style={[pickerStyles.monthBtn, isSelected && pickerStyles.monthBtnActive, isPast && pickerStyles.monthBtnPast]}
            >
              <Text style={[pickerStyles.monthText, isSelected && pickerStyles.monthTextActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── TOGGLE ROW ─────────────────────────────────────────
function ToggleRow({ icon, label, sub, value, onValueChange }: any) {
  return (
    <View style={toggleStyles.row}>
      <View style={toggleStyles.iconBox}>
        <Text style={toggleStyles.icon}>{icon}</Text>
      </View>
      <View style={toggleStyles.info}>
        <Text style={toggleStyles.label}>{label}</Text>
        <Text style={toggleStyles.sub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#2A2A2A', true: Colors.orange }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#2A2A2A"
      />
    </View>
  );
}

// ─── PASSWORD STRENGTH ──────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Too Short', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#EF4444', '#EF4444', '#F59E0B', '#22C55E', '#22C55E'];
  return (
    <View style={strengthStyles.wrap}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[strengthStyles.bar, { backgroundColor: i <= score ? colors[score] : '#222' }]} />
        ))}
      </View>
      <Text style={[strengthStyles.label, { color: colors[score] }]}>{labels[score]}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function SignupScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();

  // Mode detection (normal vs google completion)
  const [googleMode, setGoogleMode] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);

  // Role
  const [role, setRole] = useState<'customer' | 'contractor'>('customer');

  // Common
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Contractor
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradeCategory, setTradeCategory] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState(0);
  const [expiryYear, setExpiryYear] = useState(0);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [licenseCounty, setLicenseCounty] = useState('');

  // Customer
  const [publicLocation, setPublicLocation] = useState(false);

  // Permissions
  const [allowNotifications, setAllowNotifications] = useState(true);
  const [allowMotion, setAllowMotion] = useState(true);
  const [allowMedia, setAllowMedia] = useState(true);

  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── ON MOUNT: Detect Google-OAuth-completion mode ────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!data.session) { setBootChecked(true); return; }

        const userId = data.session.user.id;
        const { data: userP } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
        const { data: contractorP } = await supabase.from('contractors').select('id').eq('id', userId).maybeSingle();
        if (!mounted) return;

        if (userP || contractorP) {
          // already has a profile, no need to be here
          router.replace('/(tabs)');
          return;
        }

        // Signed in via Google but no profile → enter Google completion mode
        const meta: any = data.session.user.user_metadata ?? {};
        const fullName: string =
          meta.full_name || meta.name ||
          [meta.given_name, meta.family_name].filter(Boolean).join(' ') || '';
        setEmail(data.session.user.email ?? '');
        setLegalName(fullName);
        setGoogleMode(true);
        setBootChecked(true);
      } catch {
        setBootChecked(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ─── HANDLERS ─────────────────────────────────────────

  const handleSignup = async (requestVerification = false) => {
    if (!legalName.trim()) return Alert.alert('Required', 'Please enter your legal name.');
    if (!email.trim()) return Alert.alert('Required', 'Please enter your email.');
    if (!/\S+@\S+\.\S+/.test(email)) return Alert.alert('Invalid', 'Please enter a valid email.');
    if (email.endsWith('@tradease-employee.local')) return Alert.alert('Invalid', 'That email is reserved.');

    if (!googleMode) {
      if (password.length < 8) return Alert.alert('Weak Password', 'At least 8 characters.');
      if (password !== confirmPassword) return Alert.alert('Mismatch', 'Passwords do not match.');
    }

    if (role === 'contractor') {
      if (!phone.trim()) return Alert.alert('Required', 'Phone number is required for contractors.');
      if (!businessName.trim()) return Alert.alert('Required', 'Business name is required.');
      if (!tradeCategory) return Alert.alert('Required', 'Please select a trade category.');
    }

    if (!agreed) return Alert.alert('Terms', 'Please agree to the Terms of Service.');

    setLoading(true);
    try {
      let userId: string;

      if (googleMode) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error('Session expired. Try Google sign-in again.');
        userId = data.session.user.id;
      } else {
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: legalName.trim(), role } },
        });
        if (authErr) throw authErr;
        if (!authData.user?.id) throw new Error('Account creation failed.');
        userId = authData.user.id;
      }

      // Record ToS/Privacy acceptance. Non-blocking — `agreed` above is the
      // real, hard gate; this is just the timestamped audit record of it.
      const { error: tosErr } = await supabase.from('tos_acceptances').insert({
        user_id: userId,
        doc_version: CURRENT_TOS_VERSION,
      });
      if (tosErr) console.log('tos_acceptances insert error:', tosErr);

      // Insert profile
      if (role === 'customer') {
        const { error: insErr } = await supabase.from('users').insert({
          id: userId,
          email: email.trim().toLowerCase(),
          full_name: legalName.trim(),
          role: 'customer',
          public_location: publicLocation,
          allow_notifications: allowNotifications,
          allow_motion: allowMotion,
          allow_media: allowMedia,
          onboarding_complete: false,
        });
        if (insErr) console.log('users insert error:', insErr);
      } else {
        const licenseExpirationDate = expiryMonth > 0
          ? `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-01`
          : null;
        const { error: insErr } = await supabase.from('contractors').insert({
          id: userId,
          email: email.trim().toLowerCase(),
          legal_name: legalName.trim(),
          company_name: businessName.trim(),
          trade_type: tradeCategory,
          phone: phone.trim(),
          address: businessAddress.trim() || null,
          service_area: serviceArea.trim() || null,
          license_number: licenseNumber.trim() || null,
          license_expiration: licenseExpirationDate,
          license_county: licenseCounty.trim() || null,
          license_verified: !!licenseNumber.trim(),
          allow_notifications: allowNotifications,
          allow_motion: allowMotion,
          allow_media: allowMedia,
          approved: false,
          is_available: false,
          onboarding_complete: false,
          plan: 'free',
          verification_status: requestVerification ? 'pending_review' : 'unverified',
          ...(requestVerification ? { verification_submitted_at: new Date().toISOString() } : {}),
        });
        if (insErr) console.log('contractors insert error:', insErr);
      }

      // Sync auth metadata
      if (googleMode) {
        await supabase.auth.updateUser({ data: { full_name: legalName.trim(), role } });
      }

      if (role === 'customer') {
        router.replace('/onboarding/customer');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const isContractor = role === 'contractor';

  const canCreateContractor = isContractor &&
    legalName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(email.trim()) &&
    phone.trim().length > 6 &&
    (googleMode || password.length >= 8) &&
    (googleMode || password === confirmPassword) &&
    businessName.trim().length > 1 &&
    tradeCategory.length > 0 &&
    agreed;

  if (!bootChecked) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image source={require('../assets/concrete-bg.jpg')} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.bgOverlay} />

      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <TradeaseLogo iconSize={30} fontSize={18} gap={-13} />
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Hero */}
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>
                {googleMode ? 'One more step' : 'Create your account'}
              </Text>
              <Text style={styles.heroSub}>
                {googleMode
                  ? 'Pick your role and complete your profile.'
                  : 'Join Tradease and get started in less than a minute.'}
              </Text>
            </View>

            {/* Google Connected Banner */}
            {googleMode && (
              <View style={styles.googleBanner}>
                <Text style={styles.googleBannerIcon}>✓</Text>
                <View style={styles.googleBannerInfo}>
                  <Text style={styles.googleBannerTitle}>Connected with Google</Text>
                  <Text style={styles.googleBannerSub} numberOfLines={1}>{email}</Text>
                </View>
              </View>
            )}

            {/* Role toggle */}
            <View style={styles.roleToggle}>
              <TouchableOpacity
                style={[styles.roleOption, role === 'customer' && styles.roleOptionActive]}
                onPress={() => setRole('customer')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleEmoji}>🔍</Text>
                <View>
                  <Text style={[styles.roleLabel, role === 'customer' && styles.roleLabelActive]}>Customer</Text>
                  <Text style={styles.roleSub}>I need a contractor</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleOption, role === 'contractor' && styles.roleOptionActive]}
                onPress={() => setRole('contractor')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleEmoji}>🔧</Text>
                <View>
                  <Text style={[styles.roleLabel, role === 'contractor' && styles.roleLabelActive]}>Contractor</Text>
                  <Text style={styles.roleSub}>I do the work</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* About You */}
            <Text style={styles.sectionLabel}>ABOUT YOU</Text>
            <View style={styles.section}>
              <FocusInput
                label="Legal Name"
                required
                value={legalName}
                onChangeText={setLegalName}
                placeholder="Jane Marie Smith"
                autoCapitalize="words"
                autoComplete="name"
              />
              <FocusInput
                label="Email Address"
                required
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                editable={!googleMode}
                hint={googleMode ? 'From your Google account' : undefined}
              />
              {isContractor && (
                <FocusInput
                  label="Phone Number"
                  required
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 (555) 000-0000"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              )}

              {/* Password only for non-Google users */}
              {!googleMode && (
                <>
                  <FocusInput
                    label="Password"
                    required
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    secureTextEntry={!showPass}
                    autoComplete="new-password"
                    rightElement={
                      <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                        <Text style={styles.eye}>{showPass ? '🙈' : '👁️'}</Text>
                      </TouchableOpacity>
                    }
                  />
                  <PasswordStrength password={password} />
                  <FocusInput
                    label="Confirm Password"
                    required
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter password"
                    secureTextEntry={!showConfirm}
                    rightElement={
                      <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                        <Text style={styles.eye}>{showConfirm ? '🙈' : '👁️'}</Text>
                      </TouchableOpacity>
                    }
                  />
                </>
              )}
            </View>

            {/* Contractor sections */}
            {isContractor && (
              <>
                <Text style={styles.sectionLabel}>BUSINESS DETAILS</Text>
                <View style={styles.section}>
                  <FocusInput
                    label="Business Name"
                    required
                    value={businessName}
                    onChangeText={setBusinessName}
                    placeholder="Smith Plumbing & Heating"
                    autoCapitalize="words"
                  />
                  <View>
                    <Text style={inputStyles.label}>
                      Trade Category<Text style={inputStyles.req}> *</Text>
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tradesRow}
                      style={{ marginTop: 4 }}
                    >
                      {ALL_TRADES.map((trade) => (
                        <TouchableOpacity
                          key={trade}
                          style={[styles.tradeChip, tradeCategory === trade && styles.tradeChipActive]}
                          onPress={() => setTradeCategory(trade)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.tradeChipIcon}>{TRADE_ICONS[trade]}</Text>
                          <Text style={[styles.tradeChipText, tradeCategory === trade && styles.tradeChipTextActive]}>
                            {trade}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>SERVICE AREA · OPTIONAL</Text>
                <View style={styles.section}>
                  <FocusInput
                    label="Business Address"
                    value={businessAddress}
                    onChangeText={setBusinessAddress}
                    placeholder="123 Main St, City, State"
                    autoCapitalize="words"
                  />
                  <FocusInput
                    label="Service Area"
                    value={serviceArea}
                    onChangeText={setServiceArea}
                    placeholder="e.g. Brooklyn, Queens, Manhattan"
                    autoCapitalize="words"
                    hint="Areas you cover for jobs"
                  />
                </View>

                <Text style={styles.sectionLabel}>LICENSE INFO · OPTIONAL</Text>
                <View style={styles.licenseNotice}>
                  <Text style={styles.licenseNoticeIcon}>⚖️</Text>
                  <Text style={styles.licenseNoticeText}>
                    If your trade requires a license in your state/county, add it here for verification. Skip if not applicable.
                  </Text>
                </View>
                <View style={styles.section}>
                  <FocusInput
                    label="License Number"
                    value={licenseNumber}
                    onChangeText={setLicenseNumber}
                    placeholder="Enter it exactly as issued"
                    hint="No need to reformat it — dashes or spaces are fine either way"
                  />
                  <View style={inputStyles.wrap}>
                    <Text style={inputStyles.label}>Expiration Date</Text>
                    <TouchableOpacity
                      style={[inputStyles.box, { borderColor: expiryMonth > 0 ? Colors.orange : 'rgba(255,255,255,0.08)', marginBottom: showExpiryPicker ? 8 : 0 }]}
                      onPress={() => setShowExpiryPicker(v => !v)}
                    >
                      <Text style={[inputStyles.input, { paddingVertical: 0, color: expiryMonth > 0 ? Colors.white : '#3F3F3F' }]}>
                        {expiryMonth > 0 ? `${MONTHS[expiryMonth - 1]} ${expiryYear}` : 'Select expiry date'}
                      </Text>
                      <Text style={{ fontSize: 16 }}>📅</Text>
                    </TouchableOpacity>
                    {showExpiryPicker && (
                      <MonthYearPicker
                        month={expiryMonth}
                        year={expiryYear}
                        onSelect={(m, y) => { setExpiryMonth(m); setExpiryYear(y); setShowExpiryPicker(false); }}
                      />
                    )}
                  </View>
                  <FocusInput
                    label="County Issued"
                    value={licenseCounty}
                    onChangeText={setLicenseCounty}
                    placeholder="e.g. Suffolk County"
                    autoCapitalize="words"
                  />
                </View>
              </>
            )}

            {/* Customer location */}
            {!isContractor && (
              <>
                <Text style={styles.sectionLabel}>LOCATION</Text>
                <View style={styles.section}>
                  <ToggleRow
                    icon="📍"
                    label="Share my location publicly"
                    sub="Shows your town and ZIP — never your exact address"
                    value={publicLocation}
                    onValueChange={setPublicLocation}
                  />
                </View>
              </>
            )}

            {/* Permissions */}
            <Text style={styles.sectionLabel}>PERMISSIONS</Text>
            <View style={styles.section}>
              <ToggleRow
                icon="🔔"
                label="Notifications"
                sub="Get updates on bookings and messages"
                value={allowNotifications}
                onValueChange={setAllowNotifications}
              />
              <View style={styles.divider} />
              <ToggleRow
                icon="📡"
                label="Motion & Activity"
                sub="Used for live location and movement detection"
                value={allowMotion}
                onValueChange={setAllowMotion}
              />
              <View style={styles.divider} />
              <ToggleRow
                icon="📷"
                label="Photos & Videos"
                sub="Upload media to your profile and jobs"
                value={allowMedia}
                onValueChange={setAllowMedia}
              />
            </View>

            {/* Terms */}
            <TouchableOpacity style={styles.termsRow} activeOpacity={0.8} onPress={() => setAgreed(!agreed)}>
              <View style={[styles.checkbox, agreed && styles.checkboxActive]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink}>Terms of Service</Text>{' '}
                and <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            {isContractor ? (
              <View style={{ gap: 10 }}>
                {/* Button 1 — Create Account (basic required fields) */}
                <TouchableOpacity
                  style={styles.submitBtn}
                  activeOpacity={canCreateContractor ? 0.9 : 1}
                  onPress={canCreateContractor ? () => handleSignup(false) : undefined}
                  disabled={loading}
                >
                  {canCreateContractor ? (
                    <LinearGradient
                      colors={['#FF7A1F', '#FF6200']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.submitGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color="#0A0A0A" />
                      ) : (
                        <>
                          <Text style={styles.submitText}>
                            {googleMode ? 'Complete Contractor Profile' : 'Create Contractor Account'}
                          </Text>
                          <Text style={styles.submitArrow}>→</Text>
                        </>
                      )}
                    </LinearGradient>
                  ) : (
                    <View style={styles.verifyBtnDisabled}>
                      <Text style={styles.verifyBtnDisabledText}>Create Contractor Account</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Button 2 — Request Verification (needs address + service area too) */}
                {(() => {
                  const canVerify = canCreateContractor &&
                    businessAddress.trim().length > 0 &&
                    serviceArea.trim().length > 3;
                  return (
                    <TouchableOpacity
                      style={[styles.submitBtn, { marginTop: 0 }]}
                      activeOpacity={canVerify ? 0.9 : 1}
                      onPress={canVerify ? () => handleSignup(true) : undefined}
                      disabled={loading}
                    >
                      {canVerify ? (
                        <LinearGradient
                          colors={['#1A1A1A', '#252525']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.submitGradient, { borderWidth: 1, borderColor: '#FF6200', borderRadius: 18 }]}
                        >
                          <Text style={[styles.submitText, { color: '#FF6200' }]}>Request Verification</Text>
                          <Text style={[styles.submitArrow, { color: '#FF6200' }]}>→</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.verifyBtnDisabled}>
                          <Text style={styles.verifyBtnDisabledText}>
                            Request Verification · Add address & service area
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.9}
                onPress={() => handleSignup()}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FF7A1F', '#FF6200']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#0A0A0A" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {googleMode ? 'Complete Customer Profile' : 'Create Customer Account'}
                      </Text>
                      <Text style={styles.submitArrow}>→</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}

            {!googleMode && (
              <TouchableOpacity style={styles.signInRow} onPress={() => router.replace('/login')}>
                <Text style={styles.signInText}>
                  Already have an account? <Text style={styles.signInLink}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.securityNote}>
              <Text style={styles.securityIcon}>🔒</Text>
              <Text style={styles.securityText}>Your information is securely encrypted.</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  topSafe: { backgroundColor: 'transparent' },
  flex: { flex: 1 },

  bgImage: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: undefined, height: undefined,
  },
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,10,10,0.85)',
  },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: '#222',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: Colors.white, fontFamily: FontFamily.bold },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandHammer: { width: 28, height: 28 },
  brandWord: { fontSize: 18, fontWeight: '800', color: '#F0F0F0', letterSpacing: -0.4 },

  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  content: { gap: 16 },

  hero: { gap: 6 },
  heroTitle: {
    fontSize: 28, fontFamily: FontFamily.black,
    color: Colors.white, letterSpacing: -0.6, lineHeight: 34,
  },
  heroSub: { fontSize: 14, fontFamily: FontFamily.medium, color: Colors.textSecondary, lineHeight: 20 },

  googleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    padding: 14,
  },
  googleBannerIcon: {
    fontSize: 14, color: '#0A0A0A',
    backgroundColor: '#22C55E', width: 26, height: 26,
    borderRadius: 13, textAlign: 'center', lineHeight: 26, fontFamily: FontFamily.black,
  },
  googleBannerInfo: { flex: 1, gap: 2 },
  googleBannerTitle: { fontSize: 13, fontFamily: FontFamily.bold, color: '#22C55E' },
  googleBannerSub: { fontSize: 12, fontFamily: FontFamily.medium, color: '#16A34A' },

  roleToggle: { flexDirection: 'row', gap: 10, marginTop: 4 },
  roleOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: 16, borderWidth: 1.5, borderColor: '#1F1F1F',
    padding: 12,
  },
  roleOptionActive: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255,98,0,0.06)',
    ...Shadows.glow, shadowOpacity: 0.25, shadowRadius: 12,
  },
  roleEmoji: { fontSize: 22 },
  roleLabel: { fontSize: 13, fontFamily: FontFamily.bold, color: '#888', marginBottom: 2 },
  roleLabelActive: { color: Colors.white },
  roleSub: { fontSize: 10, fontFamily: FontFamily.medium, color: '#555' },

  sectionLabel: {
    fontSize: 11, fontFamily: FontFamily.extraBold,
    color: '#555', letterSpacing: 1.8, marginTop: 8,
  },
  section: {
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: 18, borderWidth: 1, borderColor: '#1E1E1E',
    overflow: 'hidden', paddingVertical: 6,
  },
  divider: { height: 1, backgroundColor: '#1E1E1E', marginHorizontal: 16 },

  tradesRow: { gap: 8, paddingVertical: 4, paddingHorizontal: 16 },
  tradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 100, backgroundColor: '#1A1A1A',
    borderWidth: 1.5, borderColor: '#252525',
  },
  tradeChipActive: { backgroundColor: 'rgba(255,98,0,0.15)', borderColor: Colors.orange },
  tradeChipIcon: { fontSize: 14 },
  tradeChipText: { fontSize: 12, fontFamily: FontFamily.bold, color: '#888' },
  tradeChipTextActive: { color: Colors.orange },

  licenseNotice: {
    flexDirection: 'row', gap: 10,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 12,
  },
  licenseNoticeIcon: { fontSize: 16 },
  licenseNoticeText: {
    flex: 1, fontSize: 12, fontFamily: FontFamily.medium,
    color: '#F59E0B', lineHeight: 17,
  },

  eye: { fontSize: 16 },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#333',
    backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  checkmark: { fontSize: 12, color: '#0A0A0A', fontFamily: FontFamily.black },
  termsText: { flex: 1, fontSize: 12, fontFamily: FontFamily.medium, color: '#888', lineHeight: 18 },
  termsLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 4, ...Shadows.glow },
  submitGradient: {
    height: 58, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
  },
  submitText: { fontSize: 16, fontFamily: FontFamily.black, color: '#0A0A0A', letterSpacing: 0.3 },
  submitArrow: { fontSize: 18, color: '#0A0A0A', fontFamily: FontFamily.black },

  signInRow: { alignItems: 'center', paddingVertical: 4 },
  signInText: { fontSize: 13, fontFamily: FontFamily.medium, color: '#888' },
  signInLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  securityNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: 4,
  },
  securityIcon: { fontSize: 11 },
  securityText: { fontSize: 11, fontFamily: FontFamily.medium, color: '#666' },

  verifyBtnDisabled: {
    height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 18,
  },
  verifyBtnDisabledText: { fontSize: 15, fontFamily: FontFamily.bold, color: '#444', letterSpacing: 0.2 },
  verifyUnlockNote: { fontSize: 11, fontFamily: FontFamily.medium, color: '#555', textAlign: 'center', lineHeight: 16 },
});

const inputStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 10, gap: 7 },
  label: {
    fontSize: 11, fontFamily: FontFamily.bold,
    color: '#777', letterSpacing: 0.6, textTransform: 'uppercase',
  },
  req: { color: Colors.orange },
  box: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, minHeight: 50,
  },
  boxDisabled: { backgroundColor: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.2)' },
  input: {
    flex: 1, fontSize: 15, fontFamily: FontFamily.medium,
    color: Colors.white, paddingVertical: 12,
  },
  inputDisabled: { color: '#888' },
  right: { paddingLeft: 10 },
  hint: { fontSize: 11, fontFamily: FontFamily.medium, color: '#555' },
});

const pickerStyles = StyleSheet.create({
  box: {
    backgroundColor: '#0F0F0F', borderRadius: 12, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)', padding: 14, marginTop: -2, marginBottom: 6,
  },
  yearRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingHorizontal: 4,
  },
  yearBtn: { padding: 8 },
  yearArrow: { fontSize: 20, fontFamily: FontFamily.bold, color: Colors.white },
  yearText: { fontSize: 16, fontFamily: FontFamily.black, color: Colors.white },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthBtn: {
    width: '30%', paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#161616', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  monthBtnActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  monthBtnPast: { opacity: 0.3 },
  monthText: { fontSize: 13, fontFamily: FontFamily.semibold, color: Colors.white },
  monthTextActive: { color: '#0A0A0A' },
});

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#1E1E1E',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  info: { flex: 1 },
  label: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.white, marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: FontFamily.medium, color: '#666', lineHeight: 16 },
});

const strengthStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginTop: -4, marginBottom: 6,
  },
  bars: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  label: { fontSize: 11, fontFamily: FontFamily.bold, minWidth: 60 },
});