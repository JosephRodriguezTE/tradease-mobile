// app/profile/verify-account.tsx
// Lightweight customer verification: confirmed email + confirmed phone.
// Uses Supabase Auth's own native fields (email_confirmed_at, phone_confirmed_at)
// and native OTP flows — no custom schema or infra needed. Phone verification
// requires a Phone provider (e.g. Twilio) to be configured in Supabase Auth
// (Authentication -> Providers -> Phone) or sending the code will fail.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Font, Radius } from '../../constants/theme';

const SP = { 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 } as const;

function StatusCard({ icon, title, verified, children, C }: {
  icon: string; title: string; verified: boolean; children?: React.ReactNode; C: any;
}) {
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: Radius.lg, borderWidth: 1,
      borderColor: verified ? 'rgba(34,197,94,0.35)' : C.border,
      padding: SP[4], marginBottom: SP[4], gap: SP[3],
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
          backgroundColor: verified ? 'rgba(34,197,94,0.15)' : C.surfaceAlt,
        }}>
          <Ionicons name={icon as any} size={18} color={verified ? '#22C55E' : C.textSecondary} />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: Font.bold, color: C.textPrimary }}>{title}</Text>
        {verified && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
            <Text style={{ fontSize: 11, fontWeight: Font.black, color: '#22C55E' }}>Verified</Text>
          </View>
        )}
      </View>
      {!verified && children}
    </View>
  );
}

export default function VerifyAccountScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();

  const emailVerified = !!user?.email_confirmed_at;
  const phoneVerified = !!user?.phone_confirmed_at;

  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneStage, setPhoneStage] = useState<'enter' | 'code'>('enter');
  const [code, setCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  async function resendEmailConfirmation() {
    if (!user?.email) return;
    setResendingEmail(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not resend confirmation email.');
    } finally {
      setResendingEmail(false);
    }
  }

  async function sendPhoneCode() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid number', 'Enter a valid phone number.');
      return;
    }
    setPhoneBusy(true);
    try {
      const e164 = phone.startsWith('+') ? phone : `+1${digits}`;
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) throw error;
      setPhone(e164);
      setPhoneStage('code');
    } catch (err: any) {
      Alert.alert('Could not send code', err.message ?? 'Check the number and try again.');
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyPhoneCode() {
    if (code.length !== 6) return;
    setPhoneBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'phone_change' });
      if (error) throw error;
      Alert.alert('Phone verified', 'Your phone number is now confirmed.');
    } catch (err: any) {
      Alert.alert('Incorrect code', err.message ?? 'Please try again.');
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile' as any)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: Font.black, color: C.textPrimary }}>Verify Account</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: SP[4] }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: SP[5], lineHeight: 19 }}>
            Confirming your phone and email helps contractors trust that you're a real customer.
          </Text>

          <StatusCard icon="mail-outline" title="Email" verified={emailVerified} C={C}>
            {emailSent ? (
              <Text style={{ fontSize: 13, color: '#22C55E' }}>Confirmation email sent — check your inbox.</Text>
            ) : (
              <TouchableOpacity
                onPress={resendEmailConfirmation}
                disabled={resendingEmail}
                style={{ backgroundColor: C.orange, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: resendingEmail ? 0.6 : 1 }}
              >
                {resendingEmail ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: Font.bold, color: '#fff' }}>Resend Confirmation Email</Text>}
              </TouchableOpacity>
            )}
          </StatusCard>

          <StatusCard icon="call-outline" title="Phone" verified={phoneVerified} C={C}>
            {phoneStage === 'enter' ? (
              <>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={C.textMuted}
                  keyboardType="phone-pad"
                  style={{ backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.textPrimary, marginBottom: SP[3] }}
                />
                <TouchableOpacity
                  onPress={sendPhoneCode}
                  disabled={phoneBusy}
                  style={{ backgroundColor: C.orange, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: phoneBusy ? 0.6 : 1 }}
                >
                  {phoneBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: Font.bold, color: '#fff' }}>Send Code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: SP[3] }}>Enter the 6-digit code sent to {phone}.</Text>
                <TextInput
                  value={code}
                  onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={{ backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, letterSpacing: 4, color: C.textPrimary, marginBottom: SP[3], textAlign: 'center' }}
                />
                <TouchableOpacity
                  onPress={verifyPhoneCode}
                  disabled={phoneBusy || code.length !== 6}
                  style={{ backgroundColor: C.orange, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: (phoneBusy || code.length !== 6) ? 0.6 : 1 }}
                >
                  {phoneBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: Font.bold, color: '#fff' }}>Verify Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPhoneStage('enter')} style={{ marginTop: SP[3], alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: C.textMuted }}>Use a different number</Text>
                </TouchableOpacity>
              </>
            )}
          </StatusCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
