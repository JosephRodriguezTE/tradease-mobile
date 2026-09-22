import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TradeaseLogo } from '../components/TradeaseLogo';
import { HammerLoader } from '@/components/HammerLoader';
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
import { OnboardingColors as OC, OnboardingType as OT, OnboardingSpacing as OS } from '@/lib/design/onboarding-tokens';

const { width } = Dimensions.get('window');

// Bump this when the Terms of Service / Privacy Policy text changes.
const CURRENT_TOS_VERSION = '2026-08-21';

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
          placeholderTextColor={OC.placeholder}
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

// ─── TOGGLE ROW ─────────────────────────────────────────
function ToggleRow({ icon, label, sub, value, onValueChange }: any) {
  return (
    <View style={toggleStyles.row}>
      <View style={toggleStyles.iconBox}>
        <Ionicons name={icon} size={18} color={Colors.orange} />
      </View>
      <View style={toggleStyles.info}>
        <Text style={toggleStyles.label}>{label}</Text>
        <Text style={toggleStyles.sub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: OC.disabledBorder, true: Colors.orange }}
        thumbColor={OC.white}
        ios_backgroundColor={OC.disabledBorder}
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
  const colors = [OC.error, OC.error, OC.warning, OC.success, OC.success];
  return (
    <View style={strengthStyles.wrap}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[strengthStyles.bar, { backgroundColor: i <= score ? colors[score] : OC.surfaceAlt }]} />
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
  // Insertion order is the selection order -- selectedTrades[0] is always
  // the first trade tapped, which is what gets sent as p_primary_trade_id.
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [businessAddress, setBusinessAddress] = useState('');
  const [serviceArea, setServiceArea] = useState('');

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

  const handleSignup = async () => {
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
      if (selectedTrades.length === 0) return Alert.alert('Required', 'Please select at least one trade category.');
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
        const { error: insErr } = await supabase.from('contractors').insert({
          id: userId,
          email: email.trim().toLowerCase(),
          legal_name: legalName.trim(),
          company_name: businessName.trim(),
          // trade_type is no longer set here — contractor_trades_maintain()
          // owns it exclusively, recomputed once save_contractor_trades()
          // below actually lands a row. Left unset (null) rather than
          // written directly, so a failed trade save below is honestly
          // reflected instead of showing a trade_type with no matching
          // contractor_trades row behind it.
          //
          // license_number/license_expiration/license_county are no longer
          // collected here either — get-verified.tsx (the real verification
          // flow, skippable) writes to contractor_verification, a separate
          // table nothing here ever fed. These columns stay in the schema
          // for now; signup just stops writing to them.
          phone: phone.trim(),
          address: businessAddress.trim() || null,
          service_area: serviceArea.trim() || null,
          allow_notifications: allowNotifications,
          allow_motion: allowMotion,
          allow_media: allowMedia,
          approved: false,
          is_available: false,
          onboarding_complete: false,
          plan: 'free',
          verification_status: 'unverified',
        });
        if (insErr) {
          console.log('contractors insert error:', insErr);
        } else {
          // save_contractor_trades() requires the contractor row to
          // already exist (contractor_trades.contractor_id is FK'd to
          // contractors.id) — this can only run after the insert above
          // succeeds, never in parallel with it. One retry for a
          // transient network blip; if it still fails, the account is
          // real and usable, so this doesn't block signup — but a
          // contractor with no trades matches no jobs and shows up
          // nowhere, so it's surfaced to them directly rather than only
          // logged, and contractors_missing_trades (the admin backstop)
          // catches it if they never revisit it.
          let { error: tradeErr } = await supabase.rpc('save_contractor_trades', {
            p_trade_ids: selectedTrades,
            p_primary_trade_id: selectedTrades[0],
          });
          if (tradeErr) {
            ({ error: tradeErr } = await supabase.rpc('save_contractor_trades', {
              p_trade_ids: selectedTrades,
              p_primary_trade_id: selectedTrades[0],
            }));
          }
          if (tradeErr) {
            console.log('save_contractor_trades error:', tradeErr);
            Alert.alert(
              'Trade Not Saved',
              "Your account was created, but we couldn't save your trade type. Add it from your company profile before customers can find you."
            );
          }
        }
      }

      // Sync auth metadata
      if (googleMode) {
        await supabase.auth.updateUser({ data: { full_name: legalName.trim(), role } });
      }

      if (role === 'customer') {
        router.replace('/onboarding/customer');
      } else {
        // Straight into the real, complete verification flow — no dead-end shortcut.
        router.replace('/profile/get-verified');
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
    selectedTrades.length > 0 &&
    agreed;

  // Mirrors canCreateContractor's conditions one-to-one, so the disabled button
  // can tell the user exactly what's missing instead of just staying grey.
  const missingContractorFields: string[] = [];
  if (isContractor) {
    if (!(legalName.trim().length > 1)) missingContractorFields.push('legal name');
    if (!/\S+@\S+\.\S+/.test(email.trim())) missingContractorFields.push('a valid email');
    if (!(phone.trim().length > 6)) missingContractorFields.push('phone number');
    if (!googleMode && password.length < 8) missingContractorFields.push('a password (8+ characters)');
    if (!googleMode && password !== confirmPassword) missingContractorFields.push('matching passwords');
    if (!(businessName.trim().length > 1)) missingContractorFields.push('business name');
    if (!(selectedTrades.length > 0)) missingContractorFields.push('at least one trade category');
    if (!agreed) missingContractorFields.push('agreeing to the Terms of Service');
  }

  if (!bootChecked) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <HammerLoader size={64} />
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
            <Ionicons name="chevron-back" size={20} color={Colors.white} />
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
                <View style={styles.googleBannerIcon}>
                  <Ionicons name="checkmark" size={16} color={OC.bg} />
                </View>
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
                <Ionicons name="search-outline" size={22} color={role === 'customer' ? Colors.orange : OC.iconMuted} />
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
                <Ionicons name="construct-outline" size={22} color={role === 'contractor' ? Colors.orange : OC.iconMuted} />
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
                        <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={OC.iconMuted} />
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
                        <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={OC.iconMuted} />
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
                    <Text style={styles.tradeHint}>
                      Select every trade you work in — the first one you tap is your primary trade.
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tradesRow}
                      style={{ marginTop: 4 }}
                    >
                      {ALL_TRADES.map((trade) => {
                        const active = selectedTrades.includes(trade);
                        const isPrimary = active && selectedTrades[0] === trade;
                        return (
                          <TouchableOpacity
                            key={trade}
                            style={[styles.tradeChip, active && styles.tradeChipActive]}
                            onPress={() => setSelectedTrades(prev =>
                              prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
                            )}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.tradeChipIcon}>{TRADE_ICONS[trade]}</Text>
                            <Text style={[styles.tradeChipText, active && styles.tradeChipTextActive]}>
                              {trade}{isPrimary ? ' ★' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
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
              </>
            )}

            {/* Customer location */}
            {!isContractor && (
              <>
                <Text style={styles.sectionLabel}>LOCATION</Text>
                <View style={styles.section}>
                  <ToggleRow
                    icon="location-outline"
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
                icon="notifications-outline"
                label="Notifications"
                sub="Get updates on bookings and messages"
                value={allowNotifications}
                onValueChange={setAllowNotifications}
              />
              <View style={styles.divider} />
              <ToggleRow
                icon="pulse-outline"
                label="Motion & Activity"
                sub="Used for live location and movement detection"
                value={allowMotion}
                onValueChange={setAllowMotion}
              />
              <View style={styles.divider} />
              <ToggleRow
                icon="camera-outline"
                label="Photos & Videos"
                sub="Upload media to your profile and jobs"
                value={allowMedia}
                onValueChange={setAllowMedia}
              />
            </View>

            {/* Terms */}
            <TouchableOpacity style={styles.termsRow} activeOpacity={0.8} onPress={() => setAgreed(!agreed)}>
              <View style={[styles.checkbox, agreed && styles.checkboxActive]}>
                {agreed && <Ionicons name="checkmark" size={12} color={OC.bg} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink}>Terms of Service</Text>{' '}
                and <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            {isContractor ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={styles.submitBtn}
                  activeOpacity={canCreateContractor ? 0.9 : 1}
                  onPress={canCreateContractor ? () => handleSignup() : undefined}
                  disabled={loading}
                >
                  {canCreateContractor ? (
                    <LinearGradient
                      colors={[OC.gradientStart, OC.orange]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.submitGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color={OC.bg} />
                      ) : (
                        <>
                          <Text style={styles.submitText}>
                            {googleMode ? 'Complete Contractor Profile' : 'Create Contractor Account'}
                          </Text>
                          <Ionicons name="arrow-forward" size={18} color={OC.bg} />
                        </>
                      )}
                    </LinearGradient>
                  ) : (
                    <View style={styles.verifyBtnDisabled}>
                      <Text style={styles.verifyBtnDisabledText}>
                        Add: {missingContractorFields.join(', ')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.9}
                onPress={() => handleSignup()}
                disabled={loading}
              >
                <LinearGradient
                  colors={[OC.gradientStart, OC.orange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color={OC.bg} />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {googleMode ? 'Complete Customer Profile' : 'Create Customer Account'}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color={OC.bg} />
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
              <Ionicons name="lock-closed-outline" size={12} color={OC.textMuted} />
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
  container: { flex: 1, backgroundColor: OC.bg },
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
    paddingHorizontal: OS.lgXl, paddingVertical: OS.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1, borderColor: OC.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { ...OT.ctaIcon, color: Colors.white, fontFamily: FontFamily.bold },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandHammer: { width: 28, height: 28 },
  brandWord: { ...OT.ctaIcon, fontWeight: '800', color: OC.textPrimary, letterSpacing: -0.4 },

  scroll: { paddingHorizontal: OS.xl, paddingTop: OS.lgXl, paddingBottom: OS.xxl },
  content: { gap: 16 },

  hero: { gap: 6 },
  heroTitle: {
    ...OT.heroTitle,
    color: Colors.white, letterSpacing: -0.6, lineHeight: 34,
  },
  heroSub: { ...OT.heroSub, color: Colors.textSecondary, lineHeight: 20 },

  googleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    padding: OS.lg,
  },
  googleBannerIcon: {
    backgroundColor: OC.success, width: 26, height: 26,
    borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  googleBannerInfo: { flex: 1, gap: 2 },
  googleBannerTitle: { ...OT.bannerTitle, color: OC.success },
  googleBannerSub: { ...OT.bannerSub, color: OC.googleTextDark },

  roleToggle: { flexDirection: 'row', gap: 10, marginTop: 4 },
  roleOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: 16, borderWidth: 1.5, borderColor: OC.borderSubtle,
    padding: OS.mdLg,
  },
  roleOptionActive: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255,98,0,0.06)',
  },
  roleLabel: { ...OT.roleLabel, color: OC.iconMuted, marginBottom: 2 },
  roleLabelActive: { color: Colors.white },
  roleSub: { ...OT.roleSub, color: OC.textMuted },

  sectionLabel: {
    ...OT.sectionLabel,
    color: OC.textMuted, letterSpacing: 1.8, marginTop: 8,
  },
  section: {
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderRadius: 18, borderWidth: 1, borderColor: OC.borderSubtle,
    overflow: 'hidden', paddingVertical: OS.xs,
  },
  divider: { height: 1, backgroundColor: OC.borderSubtle, marginHorizontal: 16 },

  tradeHint: { ...OT.bodyText, color: OC.iconMuted, paddingHorizontal: OS.lgXl, marginTop: 2 },
  tradesRow: { gap: 8, paddingVertical: OS.xxs, paddingHorizontal: OS.lgXl },
  tradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: OS.lg, paddingVertical: OS.smMd,
    borderRadius: 100, backgroundColor: OC.surface,
    borderWidth: 1.5, borderColor: OC.chipBorder,
  },
  tradeChipActive: { backgroundColor: 'rgba(255,98,0,0.15)', borderColor: Colors.orange },
  tradeChipIcon: OT.chipIcon,
  tradeChipText: { ...OT.chipText, color: OC.iconMuted },
  tradeChipTextActive: { color: Colors.orange },

  eye: OT.iconMd,

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: OS.xxs },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: OC.checkboxBorder,
    backgroundColor: OC.disabledBg, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  checkmark: { ...OT.checkmarkText, color: OC.bg },
  termsText: { flex: 1, ...OT.bodyText, color: OC.iconMuted, lineHeight: 18 },
  termsLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 4, ...Shadows.glow },
  submitGradient: {
    height: 58, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
  },
  submitText: { ...OT.ctaText, color: OC.bg, letterSpacing: 0.3 },
  submitArrow: { ...OT.ctaIcon, color: OC.bg, fontFamily: FontFamily.black },

  signInRow: { alignItems: 'center', paddingVertical: OS.xxs },
  signInText: { ...OT.linkText, color: OC.iconMuted },
  signInLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  securityNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: OS.xxs,
  },
  securityIcon: OT.captionText,
  securityText: { ...OT.captionText, color: OC.captionText },

  verifyBtnDisabled: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: OC.disabledBg, borderWidth: 1, borderColor: OC.disabledBorder, borderRadius: 18,
    paddingHorizontal: OS.lgXl, paddingVertical: OS.mdLg,
  },
  verifyBtnDisabledText: { ...OT.disabledCta, color: OC.disabledText, letterSpacing: 0.2, textAlign: 'center' },
  verifyUnlockNote: { ...OT.captionText, color: OC.textMuted, textAlign: 'center', lineHeight: 16 },
});

const inputStyles = StyleSheet.create({
  wrap: { paddingHorizontal: OS.lgXl, paddingVertical: OS.md, gap: 7 },
  label: {
    ...OT.fieldLabel,
    color: OC.labelText, letterSpacing: 0.6, textTransform: 'uppercase',
  },
  req: { color: Colors.orange },
  box: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: OC.inputBg,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: OS.lg, minHeight: 50,
  },
  boxDisabled: { backgroundColor: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.2)' },
  input: {
    flex: 1, ...OT.fieldInput,
    color: Colors.white, paddingVertical: OS.mdLg,
  },
  inputDisabled: { color: OC.iconMuted },
  right: { paddingLeft: OS.md },
  hint: { ...OT.fieldHint, color: OC.textMuted },
});

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: OS.lgXl, paddingVertical: OS.mdLg,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: OC.borderSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: OT.ctaIcon,
  info: { flex: 1 },
  label: { ...OT.toggleLabel, color: Colors.white, marginBottom: 2 },
  sub: { ...OT.toggleSub, color: OC.captionText, lineHeight: 16 },
});

const strengthStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: OS.lgXl, marginTop: -4, marginBottom: 6,
  },
  bars: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  label: { ...OT.fieldLabel, minWidth: 60 },
});