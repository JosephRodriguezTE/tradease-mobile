import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { TradeaseLogo } from '../components/TradeaseLogo';
import {
  ActivityIndicator,
  Alert, Animated, Dimensions, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontFamily, Shadows } from '../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '../lib/supabase';
import { twoFASend } from '../lib/twoFAApi';

WebBrowser.maybeCompleteAuthSession();
const { width } = Dimensions.get('window');

function FocusInput({
  label, value, onChangeText, placeholder, secureTextEntry,
  keyboardType, autoCapitalize, autoComplete, rightElement,
}: any) {
  const [focused, setFocused] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', Colors.orange],
  });

  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Animated.View style={[styles.inputBox, { borderColor }]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#3F3F3F"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoComplete={autoComplete}
          selectionColor={Colors.orange}
          onFocus={() => { setFocused(true); Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start(); }}
          onBlur={() => { setFocused(false); Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start(); }}
        />
        {rightElement && <View style={styles.inputRight}>{rightElement}</View>}
      </Animated.View>
    </View>
  );
}

export default function LoginScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  async function check2FA(userId: string) {
    const { data: userRow } = await supabase
      .from('users')
      .select('two_factor_enabled, two_factor_method')
      .eq('id', userId)
      .single();

    if (userRow?.two_factor_enabled) {
      try {
        const res = await twoFASend('2fa_login');
        router.push(
          `/2fa-verify?method=${encodeURIComponent(res.method)}&masked=${encodeURIComponent(res.masked)}`,
        );
      } catch {
        // If send fails, let the user in rather than locking them out
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/(tabs)');
    }
  }

  const handleOwnerLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      Alert.alert('Sign in failed', error.message);
      return;
    }
    await check2FA(data.user.id);
    setLoading(false);
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      const { signInWithGoogle } = await import('../lib/googleAuth');
      const result = await signInWithGoogle();
      if (result.cancelled) {
        setLoading(false);
        return;
      }
      // New Google user → finish signup. Returning user → check 2FA then home.
      if (result.isNewUser) {
        router.replace('/signup');
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await check2FA(user.id);
        } else {
          router.replace('/(tabs)');
        }
      }
    } catch (err: any) {
      Alert.alert('Google Sign In', err.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Concrete bg */}
      <Image
        source={require('../assets/concrete-bg.jpg')}
        style={styles.bgImage}
        resizeMode="cover"
      />
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.content,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Hero */}
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Welcome back</Text>
              <Text style={styles.heroSub}>
                Sign in to continue with Tradease.
              </Text>
            </View>

            <View style={styles.section}>
              <FocusInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
              />
              <FocusInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPass}
                autoComplete="current-password"
                rightElement={
                  <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                    <Text style={styles.eye}>{showPass ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                }
              />
              <TouchableOpacity
                style={styles.forgotRow}
                onPress={() => router.push('/forgot-password')}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              activeOpacity={0.9}
              onPress={handleOwnerLogin}
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
                    <Text style={styles.submitText}>Sign In</Text>
                    <Text style={styles.submitArrow}>→</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} onPress={handleGoogle} activeOpacity={0.85}>
                <Text style={styles.socialIcon}>G</Text>
                <Text style={styles.socialText}>Google</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.switchRow}
              onPress={() => router.replace('/signup')}
            >
              <Text style={styles.switchText}>
                Don't have an account?{' '}
                <Text style={styles.switchLink}>Create Account</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.securityNote}>
              <Text style={styles.securityIcon}>🔒</Text>
              <Text style={styles.securityText}>
                Your information is securely encrypted.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  topSafe: { backgroundColor: 'transparent' },
  flex: { flex: 1 },

  bgImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: undefined, height: undefined,
  },
  bgOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
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
  content: { gap: 18 },

  hero: { gap: 6 },
  heroTitle: {
    fontSize: 32, fontFamily: FontFamily.black,
    color: Colors.white, letterSpacing: -0.6, lineHeight: 38,
  },
  heroSub: {
    fontSize: 15, fontFamily: FontFamily.medium,
    color: Colors.textSecondary, lineHeight: 22,
  },

  section: {
    backgroundColor: 'rgba(20,20,20,0.85)',
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
    color: Colors.white, paddingVertical: 12,
  },
  inputRight: { paddingLeft: 10 },
  eye: { fontSize: 16 },

  forgotRow: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 8 },
  forgotText: { fontSize: 12, fontFamily: FontFamily.bold, color: Colors.orange },

  submitBtn: {
    borderRadius: 18, overflow: 'hidden',
    ...Shadows.glow,
  },
  submitGradient: {
    height: 58,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
  },
  submitText: {
    fontSize: 16, fontFamily: FontFamily.black,
    color: '#0A0A0A', letterSpacing: 0.3,
  },
  submitArrow: { fontSize: 18, color: '#0A0A0A', fontFamily: FontFamily.black },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#222' },
  dividerText: { fontSize: 12, fontFamily: FontFamily.medium, color: '#666' },

  socialRow: { flexDirection: 'row', gap: 10 },
  socialBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1.5, borderColor: '#222',
  },
  socialIcon: { fontSize: 16, color: Colors.white, fontFamily: FontFamily.bold },
  socialText: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.white },

  switchRow: { alignItems: 'center', paddingVertical: 4 },
  switchText: { fontSize: 14, fontFamily: FontFamily.medium, color: '#777' },
  switchLink: { color: Colors.orange, fontFamily: FontFamily.bold },

  securityNote: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingBottom: 8,
  },
  securityIcon: { fontSize: 11 },
  securityText: { fontSize: 11, fontFamily: FontFamily.medium, color: '#555' },
});