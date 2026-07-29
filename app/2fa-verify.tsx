import OTPBoxes from '@/components/OTPBoxes';
import { twoFASend, twoFAVerify } from '@/lib/twoFAApi';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

export default function TwoFAVerifyScreen() {
  const router  = useRouter();
  const { method, masked } = useLocalSearchParams<{ method: string; masked: string }>();

  const [code,     setCode]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [cooldown, setCooldown] = useState(60); // starts at 60 — code was just sent by login screen

  const methodLabel = method === 'phone' ? 'text message' : 'email';

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleVerify() {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      await twoFAVerify(code, '2fa_login');
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    try {
      await twoFASend('2fa_login');
      setCode('');
      setCooldown(60);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBack() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <Ionicons name="chevron-back" size={22} color="#F0F0F0" />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <View style={s.iconRing}>
          <Ionicons name="shield-checkmark" size={28} color="#FF6200" />
        </View>

        <Text style={s.title}>Verification required</Text>
        <Text style={s.subtitle}>
          We sent a 6-digit code to your {methodLabel}{' '}
          <Text style={s.masked}>{masked}</Text>. Enter it below to continue.
        </Text>

        <View style={s.otpWrap}>
          <OTPBoxes
            value={code}
            onChange={v => { setCode(v); setError(''); }}
            hasError={!!error}
            autoFocus
          />
        </View>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.verifyBtn, (loading || code.length < 6) && s.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length < 6}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.verifyBtnText}>Verify & Continue</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={s.resendBtn}
          onPress={handleResend}
          disabled={cooldown > 0 || loading}
        >
          <Text style={[s.resendText, cooldown > 0 && s.resendDim]}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't receive it? Resend"}
          </Text>
        </TouchableOpacity>

        <Text style={s.backHint}>Tap ← to cancel and return to login</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#0D0D0D' },
  header:            { paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  body:              { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 20 },
  iconRing:          { width: 60, height: 60, borderRadius: 16, backgroundColor: 'rgba(255,98,0,0.10)', borderWidth: 1, borderColor: 'rgba(255,98,0,0.20)', alignItems: 'center', justifyContent: 'center' },

  title:             { fontSize: 26, fontWeight: '800', color: '#F0F0F0', letterSpacing: -0.5 },
  subtitle:          { fontSize: 15, color: '#9090A8', lineHeight: 24 },
  masked:            { color: '#F0F0F0', fontWeight: '600' },

  otpWrap:           { alignItems: 'center', paddingVertical: 8 },

  errorBox:          { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 10, padding: 12, alignItems: 'center' },
  errorText:         { fontSize: 13, color: '#EF4444', textAlign: 'center' },

  verifyBtn:         { backgroundColor: '#FF6200', borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center' },
  verifyBtnDisabled: { opacity: 0.45 },
  verifyBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },

  resendBtn:         { alignItems: 'center', paddingVertical: 4 },
  resendText:        { fontSize: 14, color: '#FF6200', fontWeight: '500' },
  resendDim:         { color: '#3A3A50' },

  backHint:          { textAlign: 'center', fontSize: 12, color: '#3A3A50', marginTop: 4 },
});
