import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Plan } from '../lib/planAccess';
import { PLANS } from '../lib/plans';

export function UpgradeGate({ requiredPlan }: { requiredPlan: Exclude<Plan, 'free'> }) {
  const plan = PLANS[requiredPlan];
  return (
    <View style={s.gate}>
      <Text style={s.lock}>🔒</Text>
      <Text style={s.title}>{plan.name} Plan Required</Text>
      <Text style={s.price}>{plan.price}</Text>
      <TouchableOpacity
        style={s.btn}
        onPress={() => Alert.alert('Coming Soon', 'Payments launching soon!')}
        activeOpacity={0.8}
      >
        <Text style={s.btnText}>Upgrade to {plan.name}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  gate:    { alignItems: 'center', padding: 32, gap: 10 },
  lock:    { fontSize: 36 },
  title:   { fontSize: 16, fontWeight: '800', color: '#F0F0F5', textAlign: 'center' },
  price:   { fontSize: 14, color: '#9090A8' },
  btn:     { backgroundColor: '#FF6200', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28, marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
