import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { TradeaseLogo } from '../components/TradeaseLogo';
import {
  ActivityIndicator, Animated, Dimensions, Image,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontFamily, Shadows } from '../constants/theme';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

function FocusInput({ label, value, onChangeText, placeholder, keyboardType, autoComplete }: any) {
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
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          autoComplete={autoComplete}
          selectionColor={Colors.orange}
          onFocus={() => Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() =>  Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start()}
        />
      </Animated.View>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  // Animate in on mount
  useState(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
    ]).start();
  });

  async function handleSend() {
    const addr = email.trim().toLowerCase();
    if (!addr) { setError('Please enter your email address.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addr)) { setError('Please enter a valid email address.'); return; }

    setLoading(true);
    setError('');

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(addr, {
      redirectTo: 'tradease://reset-password',
    });

    setLoading(false);

    if (resetErr) {
      setError(resetErr.message);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);

    // Animate success checkmark
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }

  return (
    <View style={s.container}>
      <Image source={require('../assets/concrete-bg.jpg')} style={s.bgImage} resizeMode="cover" />
      <View style={s.bgOverlay} />

      <SafeAreaView edges={['top']} style={s.topSafe}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
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

            {!sent ? (
              /* ── Request form ─────────────────────────────────────────── */
              <>
                <View style={s.iconWrap}>
                  <View style={s.iconCircle}>
                    <Text style={s.iconEmoji}>🔑</Text>
                  </View>
                </View>

                <View style={s.hero}>
                  <Text style={s.heroTitle}>Forgot your{'\n'}password?</Text>
                  <Text style={s.heroSub}>
                    No problem. Enter the email you signed up with and we'll
                    send you a secure reset link.
                  </Text>
                </View>

                <View style={s.section}>
                  <FocusInput
                    label="Email Address"
                    value={email}
                    onChangeText={(v: string) => { setEmail(v); setError(''); }}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>

                {!!error && (
                  <View style={s.errorBox}>
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.submitBtn, loading && { opacity: 0.7 }]}
                  activeOpacity={0.9}
                  onPress={handleSend}
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
                        <Text style={s.submitText}>Send Reset Link</Text>
                        <Text style={s.submitArrow}>→</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.backToLogin} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
                  <Text style={s.backToLoginText}>
                    Remember it?{' '}
                    <Text style={s.backToLoginLink}>Back to Sign In</Text>
                  </Text>
                </TouchableOpacity>

                <View style={s.securityNote}>
                  <Text style={s.securityIcon}>🔒</Text>
                  <Text style={s.securityText}>Reset links expire in 1 hour for your security.</Text>
                </View>
              </>
            ) : (
              /* ── Success state ────────────────────────────────────────── */
              <>
                <Animated.View style={[s.successIconWrap, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>
                  <LinearGradient
                    colors={['rgba(34,197,94,0.18)', 'rgba(34,197,94,0.06)']}
                    style={s.successCircle}
                  >
                    <Text style={s.successEmoji}>✉️</Text>
                  </LinearGradient>
                </Animated.View>

                <View style={s.hero}>
                  <Text style={s.heroTitle}>Check your{'\n'}inbox</Text>
                  <Text style={s.heroSub}>
                    We sent a password reset link to
                  </Text>
                  <Text style={s.sentEmail}>{email.trim().toLowerCase()}</Text>
                  <Text style={[s.heroSub, { marginTop: 6 }]}>
                    Tap the link in that email to choose a new password. It expires in 1 hour.
                  </Text>
                </View>

                <View style={s.infoBox}>
                  <Text style={s.infoRow}>
                    <Text style={s.infoBullet}>• </Text>
                    Check your spam folder if you don't see it.
                  </Text>
                  <Text style={s.infoRow}>
                    <Text style={s.infoBullet}>• </Text>
                    The link will open the Tradease app directly.
                  </Text>
                  <Text style={s.infoRow}>
                    <Text style={s.infoBullet}>• </Text>
                    Only the most recent link is valid.
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
                    <Text style={s.submitText}>Back to Sign In</Text>
                    <Text style={s.submitArrow}>→</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.resendRow}
                  onPress={() => { setSent(false); setEmail(''); }}
                >
                  <Text style={s.resendText}>
                    Wrong email?{' '}
                    <Text style={s.resendLink}>Try again</Text>
                  </Text>
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
  container:   { flex: 1, backgroundColor: '#0A0A0A' },
  topSafe:     { backgroundColor: 'transparent' },
  flex:        { flex: 1 },
  bgImage:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bgOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.88)' },

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
  backArrow: { fontSize: 18, color: '#F0F0F0', fontFamily: FontFamily.bold },

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
  sentEmail: {
    fontSize: 15, fontFamily: FontFamily.bold,
    color: Colors.orange, marginTop: 2,
  },

  section: {
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 18,
    borderWidth: 1, borderColor: '#1E1E1E',
    paddingVertical: 6,
  },
  inputWrap: { paddingHorizontal: 16, paddingVertical: 10, gap: 7 },
  inputLabel: {
    fontSize: 11, fontFamily: FontFamily.bold,
    color: '#777', letterSpacing: 0.6, textTransform: 'uppercase',
  },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, minHeight: 50,
  },
  input: {
    flex: 1, fontSize: 15,
    fontFamily: FontFamily.medium,
    color: '#F0F0F0', paddingVertical: 12,
  },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  errorText: { fontSize: 13, fontFamily: FontFamily.medium, color: '#EF4444', lineHeight: 20 },

  submitBtn:      { borderRadius: 18, overflow: 'hidden', ...Shadows.glow },
  submitGradient: {
    height: 58, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  submitText:  { fontSize: 16, fontFamily: FontFamily.black, color: '#0A0A0A', letterSpacing: 0.3 },
  submitArrow: { fontSize: 18, color: '#0A0A0A', fontFamily: FontFamily.black },

  backToLogin: { alignItems: 'center', paddingVertical: 4 },
  backToLoginText: { fontSize: 14, fontFamily: FontFamily.medium, color: '#777' },
  backToLoginLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  securityNote: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  securityIcon: { fontSize: 11 },
  securityText: { fontSize: 11, fontFamily: FontFamily.medium, color: '#555' },

  successIconWrap: { alignItems: 'center', marginBottom: 4 },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  successEmoji: { fontSize: 44 },

  infoBox: {
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 16, borderWidth: 1, borderColor: '#1E1E1E',
    padding: 16, gap: 10,
  },
  infoRow:   { fontSize: 13, fontFamily: FontFamily.medium, color: '#777', lineHeight: 20 },
  infoBullet: { color: Colors.orange, fontFamily: FontFamily.bold },

  resendRow: { alignItems: 'center', paddingVertical: 4 },
  resendText: { fontSize: 14, fontFamily: FontFamily.medium, color: '#777' },
  resendLink: { color: Colors.orange, fontFamily: FontFamily.bold },
});
