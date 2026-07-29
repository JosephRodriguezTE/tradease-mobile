import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0A0A0F',
  surface:     '#13131A',
  surfaceAlt:  '#1C1C26',
  border:      '#2A2A38',
  borderLight: '#3A3A4E',
  primary:     '#FF6200',
  primaryMuted:'rgba(255,98,0,0.12)',
  error:       '#EF4444',
  errorMuted:  'rgba(239,68,68,0.10)',
  success:     '#22C55E',
  successMuted:'rgba(34,197,94,0.10)',
  textPrimary: '#F0F0F5',
  textSecondary:'#9090A8',
  textTertiary:'#5A5A70',
};
const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const R  = { sm:6, md:10, lg:16, xl:22, full:9999 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;

// ─── Password field ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
}

function PasswordField({ label, value, onChange, placeholder, error, returnKeyType = 'next', onSubmitEditing, inputRef }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = error ? C.error : focused ? C.primary : C.border;

  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <View style={[f.box, { borderColor }]}>
        <TextInput
          ref={inputRef}
          style={f.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? '••••••••'}
          placeholderTextColor={C.textTertiary}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === 'done'}
          selectionColor={C.primary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity
          onPress={() => setVisible(v => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={f.eye}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textTertiary} />
        </TouchableOpacity>
      </View>
      {error ? (
        <View style={f.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={C.error} />
          <Text style={f.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const f = StyleSheet.create({
  wrap:     { gap: SP[2] },
  label:    { fontSize: TY.xs, fontWeight: '700', color: C.textTertiary, letterSpacing: 0.8, textTransform: 'uppercase' },
  box:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: R.md, borderWidth: 1.5, paddingHorizontal: SP[4] },
  input:    { flex: 1, fontSize: TY.base, color: C.textPrimary, paddingVertical: SP[4] },
  eye:      { paddingLeft: SP[2] },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: SP[1] },
  errorText:{ fontSize: TY.xs, color: C.error },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const router = useRouter();

  const [current,   setCurrent]   = useState('');
  const [next,      setNext]      = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [saving,    setSaving]    = useState(false);

  const [currentErr, setCurrentErr] = useState('');
  const [nextErr,    setNextErr]    = useState('');
  const [confirmErr, setConfirmErr] = useState('');

  const nextRef    = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  function clearErrors() {
    setCurrentErr('');
    setNextErr('');
    setConfirmErr('');
  }

  function validate(): boolean {
    clearErrors();
    let ok = true;
    if (!current.trim()) {
      setCurrentErr('Current password is required.');
      ok = false;
    }
    if (next.length < 8) {
      setNextErr('New password must be at least 8 characters.');
      ok = false;
    }
    if (next !== confirm) {
      setConfirmErr('Passwords do not match.');
      ok = false;
    }
    return ok;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    try {
      // Re-authenticate with current password to verify it before changing
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? '';

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInErr) {
        setCurrentErr('Current password is incorrect.');
        setSaving(false);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) throw updateErr;

      Alert.alert(
        'Password Updated',
        'Your password has been changed successfully.',
        [{ text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') }],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = current.length > 0 && next.length >= 8 && confirm.length >= 8 && !saving;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Change Password</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Icon hero */}
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Ionicons name="lock-closed" size={26} color={C.primary} />
            </View>
            <Text style={s.heroTitle}>Update your password</Text>
            <Text style={s.heroSub}>
              Use a strong password with letters, numbers, and symbols.
            </Text>
          </View>

          {/* Fields card */}
          <View style={s.card}>
            <PasswordField
              label="Current Password"
              value={current}
              onChange={v => { setCurrent(v); if (currentErr) setCurrentErr(''); }}
              error={currentErr}
              returnKeyType="next"
              onSubmitEditing={() => nextRef.current?.focus()}
            />
            <View style={s.divider} />
            <PasswordField
              label="New Password"
              value={next}
              onChange={v => { setNext(v); if (nextErr) setNextErr(''); }}
              error={nextErr}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              inputRef={nextRef}
            />
            <View style={s.divider} />
            <PasswordField
              label="Confirm New Password"
              value={confirm}
              onChange={v => { setConfirm(v); if (confirmErr) setConfirmErr(''); }}
              error={confirmErr}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              inputRef={confirmRef}
            />
          </View>

          {/* Password strength hint */}
          <View style={s.hintRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color={C.textTertiary} />
            <Text style={s.hintText}>
              Minimum 8 characters. Use a mix of uppercase, lowercase, numbers, and symbols for a stronger password.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>Update Password</Text>
                </>
              )
            }
          </TouchableOpacity>

          <View style={{ height: SP[10] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.bg },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:       { flex: 1, textAlign: 'center', fontSize: TY.md, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3 },

  scroll:            { paddingHorizontal: SP[4], paddingTop: SP[6] },

  hero:              { alignItems: 'center', gap: SP[2], marginBottom: SP[6] },
  heroIcon:          { width: 60, height: 60, borderRadius: R.xl, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,98,0,0.2)', marginBottom: SP[2] },
  heroTitle:         { fontSize: TY.lg, fontWeight: '800', color: C.textPrimary },
  heroSub:           { fontSize: TY.sm, color: C.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: SP[4] },

  card:              { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, padding: SP[4], gap: SP[4] },
  divider:           { height: 0.5, backgroundColor: C.border },

  hintRow:           { flexDirection: 'row', gap: SP[2], alignItems: 'flex-start', marginTop: SP[3], paddingHorizontal: SP[1] },
  hintText:          { flex: 1, fontSize: TY.xs, color: C.textTertiary, lineHeight: 17 },

  submitBtn:         { marginTop: SP[6], backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: SP[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2] },
  submitBtnDisabled: { opacity: 0.35 },
  submitBtnText:     { fontSize: TY.md, fontWeight: '700', color: '#fff' },
});
