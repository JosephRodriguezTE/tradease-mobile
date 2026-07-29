import TwoFAEnrollSheet from '@/components/TwoFAEnrollSheet';
import { twoFADisable } from '@/lib/twoFAApi';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:8,md:12,lg:16,xl:20 } as const;

export default function SecurityScreen() {
  const router = useRouter();

  const [userEmail,    setUserEmail]    = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAMethod,  setTwoFAMethod]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [showEnroll,   setShowEnroll]   = useState(false);
  const [showDisable,  setShowDisable]  = useState(false);
  const [disabling,    setDisabling]    = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? '');
      const { data } = await supabase
        .from('users')
        .select('two_factor_enabled, two_factor_method')
        .eq('id', user.id)
        .single();
      setTwoFAEnabled(data?.two_factor_enabled ?? false);
      setTwoFAMethod(data?.two_factor_method ?? null);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDisable() {
    setDisabling(true);
    try {
      await twoFADisable();
      setTwoFAEnabled(false);
      setTwoFAMethod(null);
      setShowDisable(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDisabling(false);
    }
  }

  const methodLabel = twoFAMethod === 'phone' ? 'SMS' : 'Email';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#F0F0F0" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Security</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* 2FA card */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#FF6200" />
            <Text style={s.cardTitle}>Two-Factor Authentication</Text>
          </View>

          {loading ? (
            <ActivityIndicator color="#FF6200" style={{ paddingVertical: SP[5] }} />
          ) : (
            <>
              {/* Status badge */}
              <View style={s.statusRow}>
                <Text style={s.statusLabel}>Status:</Text>
                {twoFAEnabled ? (
                  <View style={s.badgeOn}>
                    <Text style={s.badgeOnText}>Enabled · {methodLabel}</Text>
                  </View>
                ) : (
                  <View style={s.badgeOff}>
                    <Text style={s.badgeOffText}>Not enabled</Text>
                  </View>
                )}
              </View>

              {twoFAEnabled ? (
                <>
                  <Text style={s.cardSub}>
                    Your account is protected. A verification code is required each time you sign in.
                  </Text>

                  {!showDisable ? (
                    <TouchableOpacity
                      style={s.disableBtn}
                      onPress={() => setShowDisable(true)}
                    >
                      <Text style={s.disableBtnText}>Disable 2FA</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.disableConfirm}>
                      <Text style={s.disableConfirmTitle}>Remove two-factor authentication?</Text>
                      <Text style={s.disableConfirmSub}>
                        This will make your account less secure. You can re-enable it at any time.
                      </Text>
                      <View style={s.disableActions}>
                        <TouchableOpacity
                          style={s.cancelBtn}
                          onPress={() => setShowDisable(false)}
                          disabled={disabling}
                        >
                          <Text style={s.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.confirmBtn, disabling && { opacity: 0.5 }]}
                          onPress={handleDisable}
                          disabled={disabling}
                        >
                          {disabling
                            ? <ActivityIndicator color="#EF4444" size="small" />
                            : <Text style={s.confirmBtnText}>Yes, disable</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={s.cardSub}>
                    Add an extra layer of security — a one-time code sent to your email or phone at every sign-in.
                  </Text>
                  <TouchableOpacity style={s.enableBtn} onPress={() => setShowEnroll(true)}>
                    <Text style={s.enableBtnText}>Enable 2FA</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>

      </ScrollView>

      <TwoFAEnrollSheet
        visible={showEnroll}
        onClose={() => setShowEnroll(false)}
        userEmail={userEmail}
        onEnabled={() => {
          setTwoFAEnabled(true);
          // method is set server-side; re-fetch to get it
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            supabase
              .from('users')
              .select('two_factor_method')
              .eq('id', user.id)
              .single()
              .then(({ data }) => setTwoFAMethod(data?.two_factor_method ?? null));
          });
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0D0D0D' },

  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: '#2E2E2E' },
  backBtn:             { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:         { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#F0F0F0', letterSpacing: -0.3 },

  scroll:              { paddingHorizontal: SP[4], paddingTop: SP[5], paddingBottom: SP[10], gap: SP[4] },

  card:                { backgroundColor: '#1A1A1A', borderRadius: R.lg, borderWidth: 0.5, borderColor: '#2E2E2E', padding: SP[6], gap: SP[4] },
  cardHeader:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle:           { fontSize: 15, fontWeight: '700', color: '#F0F0F0' },
  cardSub:             { fontSize: 13, color: '#9090A8', lineHeight: 20 },

  statusRow:           { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusLabel:         { fontSize: 14, fontWeight: '600', color: '#F0F0F0' },

  badgeOn:             { backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOnText:         { fontSize: 11, fontWeight: '700', color: '#22C55E' },
  badgeOff:            { backgroundColor: 'rgba(144,144,168,0.1)', borderWidth: 1, borderColor: 'rgba(144,144,168,0.25)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOffText:        { fontSize: 11, fontWeight: '700', color: '#9090A8' },

  enableBtn:           { backgroundColor: '#FF6200', borderRadius: R.md, height: 46, alignItems: 'center', justifyContent: 'center' },
  enableBtnText:       { fontSize: 14, fontWeight: '700', color: '#fff' },

  disableBtn:          { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  disableBtnText:      { fontSize: 13, fontWeight: '600', color: '#EF4444' },

  disableConfirm:      { backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: R.md, padding: SP[4], gap: SP[3] },
  disableConfirmTitle: { fontSize: 14, fontWeight: '600', color: '#F0F0F0' },
  disableConfirmSub:   { fontSize: 13, color: '#9090A8', lineHeight: 20 },

  disableActions:      { flexDirection: 'row', gap: 10 },
  cancelBtn:           { flex: 1, height: 40, borderRadius: R.sm, borderWidth: 1, borderColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  cancelBtnText:       { fontSize: 13, fontWeight: '600', color: '#9090A8' },
  confirmBtn:          { flex: 1, height: 40, borderRadius: R.sm, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', alignItems: 'center', justifyContent: 'center' },
  confirmBtnText:      { fontSize: 13, fontWeight: '600', color: '#EF4444' },
});
