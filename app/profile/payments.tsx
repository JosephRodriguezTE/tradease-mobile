import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:           '#0A0A0F',
  surface:      '#13131A',
  surfaceAlt:   '#1C1C26',
  border:       '#2A2A38',
  primary:      '#FF6200',
  primaryMuted: 'rgba(255,98,0,0.10)',
  info:         '#38BDF8',
  infoMuted:    'rgba(56,189,248,0.08)',
  textPrimary:  '#F0F0F5',
  textSecondary:'#9090A8',
  textTertiary: '#5A5A70',
};
const SP = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;
const R  = { sm:6, md:10, lg:16, xl:22, full:9999 } as const;
const TY = { xs:11, sm:13, base:15, md:17, lg:20, xl:24 } as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PaymentsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payment Methods</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* Empty state card */}
        <View style={s.emptyCard}>
          <View style={s.emptyIconBox}>
            <Ionicons name="card-outline" size={28} color={C.textTertiary} />
          </View>
          <Text style={s.emptyTitle}>No payment methods added yet</Text>
          <Text style={s.emptySub}>
            Your saved cards and payment options will appear here once Stripe is connected.
          </Text>
        </View>

        {/* Disabled Add Card button */}
        <View style={s.addCardBtn}>
          <Ionicons name="lock-closed" size={16} color={C.textTertiary} />
          <Text style={s.addCardText}>Stripe payments coming soon</Text>
        </View>

        {/* Info box */}
        <View style={s.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={C.info} style={{ marginTop: 1 }} />
          <Text style={s.infoText}>
            When Stripe is connected, you can save cards here and all job payments will be processed automatically.
            Funds are held in escrow until job completion and released to contractors within 2–5 business days.
          </Text>
        </View>

        {/* Security note */}
        <View style={s.secureRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={C.textTertiary} />
          <Text style={s.secureText}>
            Card data is never stored on Tradease servers. All payments are encrypted and processed by Stripe.
          </Text>
        </View>

        <View style={{ height: SP[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: TY.md, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3 },

  scroll:       { paddingHorizontal: SP[4], paddingTop: SP[6], gap: SP[4] },

  emptyCard:    { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', paddingVertical: SP[8], paddingHorizontal: SP[6], gap: SP[3] },
  emptyIconBox: { width: 60, height: 60, borderRadius: R.xl, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.border },
  emptyTitle:   { fontSize: TY.base, fontWeight: '700', color: C.textPrimary },
  emptySub:     { fontSize: TY.sm, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },

  addCardBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2], backgroundColor: C.surfaceAlt, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, paddingVertical: SP[4], opacity: 0.5 },
  addCardText:  { fontSize: TY.base, fontWeight: '600', color: C.textTertiary },

  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: SP[3], backgroundColor: C.infoMuted, borderRadius: R.lg, borderWidth: 0.5, borderColor: 'rgba(56,189,248,0.2)', padding: SP[4] },
  infoText:     { flex: 1, fontSize: TY.sm, color: C.textSecondary, lineHeight: 20 },

  secureRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: SP[2], paddingHorizontal: SP[1] },
  secureText:   { flex: 1, fontSize: TY.xs, color: C.textTertiary, lineHeight: 17 },
});
