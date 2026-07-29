import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { TradeaseLogo } from '../components/TradeaseLogo';
import {
  ActivityIndicator, Animated, Image,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontFamily, Shadows } from '../constants/theme';
import { supabase } from '../lib/supabase';

const MIN_LENGTH = 8;

function PasswordStrength({ password }: { password: string }) {
  const len     = password.length;
  const hasUpper = /[A-Z]/.test(password);
  const hasNum   = /[0-9]/.test(password);
  const hasSpec  = /[^A-Za-z0-9]/.test(password);
  const score    = [len >= MIN_LENGTH, hasUpper, hasNum, hasSpec].filter(Boolean).length;

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const color = ['#444', '#EF4444', '#FBBF24', '#38BDF8', '#22C55E'][score];
  const bars  = 4;

  if (!password) return null;

  return (
    <View style={ps.wrap}>
      <View style={ps.bars}>
        {Array.from({ length: bars }).map((_, i) => (
          <View
            key={i}
            style={[ps.bar, { backgroundColor: i < score ? color : '#222' }]}
          />
        ))}
      </View>
      <Text style={[ps.label, { color }]}>{label}</Text>
    </View>
  );
}

const ps = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  bars:  { flex: 1, flexDirection: 'row', gap: 4 },
  bar:   { flex: 1, height: 3, borderRadius: 2 },
  label: { fontSize: 11, fontFamily: FontFamily.bold, width: 44, textAlign: 'right' },
});

function FocusInput({ label, value, onChangeText, placeholder, secureTextEntry, rightElement }: any) {
  const glow = useRef(new Animated.Value(0)).current;
  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', Colors.orange],
  });

  return (
    <View style={s.inputWrap}>
      <Text style={s.inputLabel}>{label}</Text>
      <Animated.View style={[s.inputBox, { borderColor }]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#3F3F3F"
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoComplete="new-password"
          selectionColor={Colors.orange}
          onFocus={() => Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() =>  Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
        {rightElement && <View style={s.inputRight}>{rightElement}</View>}
      </Animated.View>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(24)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useState(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
    ]).start();
  });

  function validate(): string | null {
    if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async function handleReset() {
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDone(true);

    Animated.spring(checkScale, {
      toValue: 1, friction: 5, tension: 80, useNativeDriver: true,
    }).start();
  }

  return (
    <View style={s.container}>
      <Image source={require('../assets/concrete-bg.jpg')} style={s.bgImage} resizeMode="cover" />
      <View style={s.bgOverlay} />

      <SafeAreaView edges={['top']} style={s.topSafe}>
        <View style={s.topBar}>
          <View style={{ width: 40 }} />
          <TradeaseLogo iconSize={30} fontSize={18} gap={-13} />
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {!done ? (
              <>
                <View style={s.iconWrap}>
                  <View style={s.iconCircle}>
                    <Text style={s.iconEmoji}>🔒</Text>
                  </View>
                </View>

                <View style={s.hero}>
                  <Text style={s.heroTitle}>Set a new{'\n'}password</Text>
                  <Text style={s.heroSub}>
                    Choose something strong. You'll use it every time you sign in to Tradease.
                  </Text>
                </View>

                <View style={s.section}>
                  <FocusInput
                    label="New Password"
                    value={password}
                    onChangeText={(v: string) => { setPassword(v); setError(''); }}
                    placeholder="At least 8 characters"
                    secureTextEntry={!showPass}
                    rightElement={
                      <TouchableOpacity onPress={() => setShowPass(p => !p)}>
                        <Text style={s.eye}>{showPass ? '🙈' : '👁️'}</Text>
                      </TouchableOpacity>
                    }
                  />
                  <PasswordStrength password={password} />

                  <FocusInput
                    label="Confirm Password"
                    value={confirm}
                    onChangeText={(v: string) => { setConfirm(v); setError(''); }}
                    placeholder="Repeat your new password"
                    secureTextEntry={!showConf}
                    rightElement={
                      confirm.length > 0 ? (
                        <Text style={{ fontSize: 16 }}>
                          {confirm === password ? '✅' : '❌'}
                        </Text>
                      ) : (
                        <TouchableOpacity onPress={() => setShowConf(p => !p)}>
                          <Text style={s.eye}>{showConf ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      )
                    }
                  />
                </View>

                {!!error && (
                  <View style={s.errorBox}>
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                )}

                <View style={s.requirementBox}>
                  {[
                    { label: 'At least 8 characters',           pass: password.length >= MIN_LENGTH },
                    { label: 'One uppercase letter',             pass: /[A-Z]/.test(password) },
                    { label: 'One number',                       pass: /[0-9]/.test(password) },
                    { label: 'One special character (optional)', pass: /[^A-Za-z0-9]/.test(password) },
                  ].map((r, i) => (
                    <View key={i} style={s.requirementRow}>
                      <Text style={[s.requirementDot, { color: r.pass ? '#22C55E' : '#444' }]}>
                        {r.pass ? '✓' : '·'}
                      </Text>
                      <Text style={[s.requirementText, { color: r.pass ? '#888' : '#555' }]}>
                        {r.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.submitBtn, loading && { opacity: 0.7 }]}
                  activeOpacity={0.9}
                  onPress={handleReset}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#FF7A1F', '#FF6200']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.submitGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#0A0A0A" />
                    ) : (
                      <>
                        <Text style={s.submitText}>Update Password</Text>
                        <Text style={s.submitArrow}>→</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={s.securityNote}>
                  <Text style={s.securityIcon}>🔒</Text>
                  <Text style={s.securityText}>Your new password is encrypted and stored securely.</Text>
                </View>
              </>
            ) : (
              <>
                <Animated.View style={[s.successWrap, { transform: [{ scale: checkScale }] }]}>
                  <LinearGradient
                    colors={['rgba(34,197,94,0.18)', 'rgba(34,197,94,0.06)']}
                    style={s.successCircle}
                  >
                    <Text style={s.successEmoji}>✅</Text>
                  </LinearGradient>
                </Animated.View>

                <View style={s.hero}>
                  <Text style={s.heroTitle}>Password{'\n'}updated</Text>
                  <Text style={s.heroSub}>
                    Your password has been changed successfully. Sign in with your new credentials.
                  </Text>
                </View>

                <TouchableOpacity
                  style={s.submitBtn}
                  activeOpacity={0.9}
                  onPress={() => router.replace('/login')}
                >
                  <LinearGradient
                    colors={['#FF7A1F', '#FF6200']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.submitGradient}
                  >
                    <Text style={s.submitText}>Sign In Now</Text>
                    <Text style={s.submitArrow}>→</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A0A0A' },
  topSafe:    { backgroundColor: 'transparent' },
  flex:       { flex: 1 },
  bgImage:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bgOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.88)' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },

  scroll:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  content: { gap: 22 },

  iconWrap:   { alignItems: 'center', marginBottom: 4 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,98,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,98,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 34 },

  hero:      { gap: 8 },
  heroTitle: {
    fontSize: 34, fontFamily: FontFamily.black,
    color: '#F0F0F0', letterSpacing: -0.7, lineHeight: 42,
  },
  heroSub: {
    fontSize: 15, fontFamily: FontFamily.medium,
    color: '#888', lineHeight: 23,
  },

  section: {
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 18, borderWidth: 1, borderColor: '#1E1E1E',
    paddingVertical: 6,
  },
  inputWrap:  { paddingHorizontal: 16, paddingVertical: 10, gap: 7 },
  inputLabel: { fontSize: 11, fontFamily: FontFamily.bold, color: '#777', letterSpacing: 0.6, textTransform: 'uppercase' },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F0F0F', borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, minHeight: 50,
  },
  input:      { flex: 1, fontSize: 15, fontFamily: FontFamily.medium, color: '#F0F0F0', paddingVertical: 12 },
  inputRight: { paddingLeft: 10 },
  eye:        { fontSize: 16 },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  errorText: { fontSize: 13, fontFamily: FontFamily.medium, color: '#EF4444', lineHeight: 20 },

  requirementBox: {
    backgroundColor: 'rgba(20,20,20,0.88)', borderRadius: 14,
    borderWidth: 1, borderColor: '#1E1E1E',
    padding: 14, gap: 8,
  },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  requirementDot: { fontSize: 14, fontFamily: FontFamily.bold, width: 16, textAlign: 'center' },
  requirementText:{ fontSize: 12, fontFamily: FontFamily.medium },

  submitBtn:      { borderRadius: 18, overflow: 'hidden', ...Shadows.glow },
  submitGradient: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  submitText:     { fontSize: 16, fontFamily: FontFamily.black, color: '#0A0A0A', letterSpacing: 0.3 },
  submitArrow:    { fontSize: 18, color: '#0A0A0A', fontFamily: FontFamily.black },

  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  securityIcon: { fontSize: 11 },
  securityText: { fontSize: 11, fontFamily: FontFamily.medium, color: '#555' },

  successWrap:   { alignItems: 'center', marginBottom: 4 },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  successEmoji: { fontSize: 44 },
});
