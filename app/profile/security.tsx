import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:8,md:12,lg:16,xl:20 } as const;

export default function SecurityScreen() {
  const router = useRouter();

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

        {/* 2FA card — enrollment temporarily disabled, see docs/SECURITY_BACKLOG.md */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#FF6200" />
            <Text style={s.cardTitle}>Two-Factor Authentication</Text>
          </View>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Status:</Text>
            <View style={s.badgeOff}>
              <Text style={s.badgeOffText}>Coming soon</Text>
            </View>
          </View>
          <Text style={s.cardSub}>
            We're rebuilding two-factor authentication to make it more secure. It'll be back soon — check here again later.
          </Text>
        </View>

      </ScrollView>
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

  badgeOff:            { backgroundColor: 'rgba(144,144,168,0.1)', borderWidth: 1, borderColor: 'rgba(144,144,168,0.25)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeOffText:        { fontSize: 11, fontWeight: '700', color: '#9090A8' },
});
