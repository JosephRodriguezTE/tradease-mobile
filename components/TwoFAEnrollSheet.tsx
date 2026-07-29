import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { twoFASend, twoFAVerify } from '@/lib/twoFAApi';
import OTPBoxes from './OTPBoxes';

type Step = 'prompt' | 'method' | 'phone_input' | 'verify' | 'success';

interface Props {
  visible: boolean;
  onClose: () => void;
  userEmail: string;
  onEnabled: () => void;
}

export default function TwoFAEnrollSheet({ visible, onClose, userEmail, onEnabled }: Props) {
  const [step,     setStep]     = useState<Step>('prompt');
  const [method,   setMethod]   = useState<'email' | 'phone'>('email');
  const [phone,    setPhone]    = useState('');
  const [masked,   setMasked]   = useState('');
  const [code,     setCode]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function reset() {
    setStep('prompt'); setMethod('email'); setPhone(''); setMasked('');
    setCode(''); setLoading(false); setError(''); setCooldown(0);
  }

  async function sendCode(m: 'email' | 'phone', p?: string): Promise<boolean> {
    setLoading(true); setError('');
    try {
      const res = await twoFASend('2fa_setup', m, p);
      setMasked(res.masked);
      setCooldown(60);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueMethod() {
    if (method === 'phone') { setStep('phone_input'); return; }
    const ok = await sendCode('email');
    if (ok) { setCode(''); setStep('verify'); }
  }

  async function handleContinuePhone() {
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    const ok = await sendCode('phone', phone);
    if (ok) { setCode(''); setStep('verify'); }
  }

  async function handleVerify() {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      await twoFAVerify(code, '2fa_setup', method, phone);
      setStep('success');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    const ok = await sendCode(method, method === 'phone' ? phone : undefined);
    if (ok) setCode('');
  }

  function handleDone() {
    onEnabled();
    reset();
    onClose();
  }

  function handleClose() {
    if (step === 'success') { handleDone(); return; }
    reset();
    onClose();
  }

  function goBack() {
    setError('');
    if (step === 'method')      { setStep('prompt');     return; }
    if (step === 'phone_input') { setStep('method');     return; }
    if (step === 'verify')      { setStep(method === 'phone' ? 'phone_input' : 'method'); return; }
  }

  const showBack = step !== 'prompt' && step !== 'success';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.flex}
      >
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={step === 'success' ? handleDone : handleClose}
        >
          {/* Intercept touches inside the sheet so they don't close it */}
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <View style={s.handle} />

            {step !== 'success' && (
              <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
                <Ionicons name="close" size={18} color="#5A5A70" />
              </TouchableOpacity>
            )}

            {showBack && (
              <TouchableOpacity style={s.backBtn} onPress={goBack}>
                <Ionicons name="chevron-back" size={16} color="#5A5A70" />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>
            )}

            {/* ── Prompt ─────────────────────────────────────────────────────── */}
            {step === 'prompt' && (
              <>
                <View style={s.iconRing}>
                  <Ionicons name="shield-checkmark" size={32} color="#FF6200" />
                </View>
                <Text style={s.title}>Secure your account</Text>
                <Text style={s.subtitle}>
                  Two-factor authentication adds an extra layer of protection — a one-time code you enter every time you sign in.
                </Text>
                <View style={s.bullets}>
                  {[
                    'Blocks access even if your password is compromised',
                    'Codes sent to your email or phone number',
                    'Takes less than a minute to enable',
                  ].map(item => (
                    <View key={item} style={s.bullet}>
                      <Text style={s.bulletTick}>✓</Text>
                      <Text style={s.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('method')}>
                  <Text style={s.primaryBtnText}>Enable 2FA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.ghostBtn} onPress={handleClose}>
                  <Text style={s.ghostBtnText}>Maybe later</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Method ─────────────────────────────────────────────────────── */}
            {step === 'method' && (
              <>
                <Text style={s.title}>Choose a method</Text>
                <Text style={s.subtitle}>How should we send your verification codes?</Text>
                <View style={s.methodList}>
                  {([
                    { val: 'email' as const, icon: 'mail-outline',  label: 'Email',              sub: userEmail },
                    { val: 'phone' as const, icon: 'call-outline',  label: 'Text Message (SMS)', sub: 'Enter your phone number' },
                  ] as const).map(opt => {
                    const active = method === opt.val;
                    return (
                      <TouchableOpacity
                        key={opt.val}
                        style={[s.methodCard, active && s.methodCardActive]}
                        onPress={() => setMethod(opt.val)}
                        activeOpacity={0.75}
                      >
                        <View style={[s.methodIcon, active && s.methodIconActive]}>
                          <Ionicons name={opt.icon} size={20} color={active ? '#FF6200' : '#9090A8'} />
                        </View>
                        <View style={s.methodText}>
                          <Text style={s.methodLabel}>{opt.label}</Text>
                          <Text style={s.methodSub} numberOfLines={1}>{opt.sub}</Text>
                        </View>
                        {active && (
                          <View style={s.checkCircle}>
                            <Text style={s.checkMark}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!!error && <Text style={s.errorText}>{error}</Text>}
                <TouchableOpacity
                  style={[s.primaryBtn, loading && s.btnDisabled]}
                  onPress={handleContinueMethod}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.primaryBtnText}>Continue</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            {/* ── Phone input ────────────────────────────────────────────────── */}
            {step === 'phone_input' && (
              <>
                <Text style={s.title}>Enter your phone number</Text>
                <Text style={s.subtitle}>
                  We'll send a 6-digit code to this number each time you sign in.
                </Text>
                <TextInput
                  style={[s.phoneInput, !!error && s.phoneInputError]}
                  value={phone}
                  onChangeText={v => { setPhone(v); setError(''); }}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor="#3A3A50"
                  keyboardType="phone-pad"
                  autoFocus
                />
                <Text style={s.phoneHint}>Include country code (e.g. +1 for US)</Text>
                {!!error && <Text style={s.errorText}>{error}</Text>}
                <TouchableOpacity
                  style={[s.primaryBtn, loading && s.btnDisabled]}
                  onPress={handleContinuePhone}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.primaryBtnText}>Send Code</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            {/* ── Verify OTP ─────────────────────────────────────────────────── */}
            {step === 'verify' && (
              <>
                <Text style={s.title}>Enter verification code</Text>
                <Text style={s.subtitle}>
                  Code sent to <Text style={s.masked}>{masked}</Text>. Expires in 10 minutes.
                </Text>
                <View style={s.otpRow}>
                  <OTPBoxes
                    value={code}
                    onChange={v => { setCode(v); setError(''); }}
                    hasError={!!error}
                    autoFocus
                  />
                </View>
                {!!error && (
                  <View style={s.errorBox}>
                    <Text style={s.errorBoxText}>{error}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[s.primaryBtn, (loading || code.length < 6) && s.btnDisabled]}
                  onPress={handleVerify}
                  disabled={loading || code.length < 6}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.primaryBtnText}>Verify</Text>
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
              </>
            )}

            {/* ── Success ────────────────────────────────────────────────────── */}
            {step === 'success' && (
              <View style={s.successContent}>
                <View style={s.successRing}>
                  <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
                </View>
                <Text style={s.title}>2FA Enabled</Text>
                <Text style={[s.subtitle, { textAlign: 'center' }]}>
                  Your account is now protected. You'll be asked for a verification code each time you sign in.
                </Text>
                <TouchableOpacity style={[s.primaryBtn, { alignSelf: 'stretch' }]} onPress={handleDone}>
                  <Text style={s.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex:             { flex: 1 },
  backdrop:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 0.5, borderColor: '#2E2E2E',
    padding: 24, paddingBottom: 48,
    gap: 16,
  },
  handle:           { width: 40, height: 4, backgroundColor: '#2E2E2E', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  closeBtn:         { position: 'absolute', top: 20, right: 20, width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText:         { fontSize: 13, color: '#5A5A70', fontWeight: '500' },

  iconRing:         { width: 64, height: 64, borderRadius: 18, backgroundColor: 'rgba(255,98,0,0.10)', borderWidth: 1, borderColor: 'rgba(255,98,0,0.20)', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  successRing:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  successContent:   { alignItems: 'center', gap: 12 },

  title:            { fontSize: 22, fontWeight: '800', color: '#F0F0F0', letterSpacing: -0.4 },
  subtitle:         { fontSize: 14, color: '#9090A8', lineHeight: 22 },
  masked:           { color: '#F0F0F0', fontWeight: '600' },

  bullets:          { gap: 10 },
  bullet:           { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletTick:       { color: '#FF6200', fontWeight: '700', fontSize: 13, marginTop: 1 },
  bulletText:       { fontSize: 13, color: '#9090A8', flex: 1, lineHeight: 20 },

  methodList:       { gap: 10 },
  methodCard:       { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#2E2E2E', backgroundColor: '#141414' },
  methodCardActive: { borderColor: '#FF6200', backgroundColor: 'rgba(255,98,0,0.06)' },
  methodIcon:       { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  methodIconActive: { backgroundColor: 'rgba(255,98,0,0.15)' },
  methodText:       { flex: 1 },
  methodLabel:      { fontSize: 14, fontWeight: '700', color: '#F0F0F0', marginBottom: 2 },
  methodSub:        { fontSize: 12, color: '#5A5A70' },
  checkCircle:      { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF6200', alignItems: 'center', justifyContent: 'center' },
  checkMark:        { fontSize: 10, fontWeight: '800', color: '#fff' },

  phoneInput:       { backgroundColor: '#141414', borderWidth: 1.5, borderColor: '#2E2E2E', borderRadius: 12, color: '#F0F0F0', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  phoneInputError:  { borderColor: '#EF4444' },
  phoneHint:        { fontSize: 12, color: '#3A3A50', marginTop: -8 },

  otpRow:           { alignItems: 'center', marginVertical: 4 },

  errorText:        { fontSize: 13, color: '#EF4444' },
  errorBox:         { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 10, padding: 12, alignItems: 'center' },
  errorBoxText:     { fontSize: 13, color: '#EF4444', textAlign: 'center' },

  primaryBtn:       { backgroundColor: '#FF6200', borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  ghostBtn:         { alignItems: 'center', paddingVertical: 12 },
  ghostBtnText:     { fontSize: 14, color: '#5A5A70', fontWeight: '500' },
  btnDisabled:      { opacity: 0.45 },

  resendBtn:        { alignItems: 'center', paddingVertical: 4 },
  resendText:       { fontSize: 13, color: '#FF6200', fontWeight: '500' },
  resendDim:        { color: '#3A3A50' },
});
