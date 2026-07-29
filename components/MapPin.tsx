import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { TRADE_ICONS } from '../lib/tradeJobs';

interface BasePinProps {
  selected?: boolean;
}

// ── CONTRACTOR PIN ──────────────────────────────────────
export function ContractorPin({
  trade,
  verified,
  isLive,
  isOnline,
  selected,
}: BasePinProps & {
  trade: string;
  verified?: boolean;
  isLive?: boolean;
  isOnline?: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(selected ? 1.2 : 1)).current;

  useEffect(() => {
    if (isLive || isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isLive, isOnline]);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: selected ? 1.25 : 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [selected]);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={styles.pinWrapper}>
      {(isLive || isOnline) && (
        <Animated.View
          style={[
            styles.pulse,
            {
              backgroundColor: '#22C55E',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.contractorPin,
          selected && styles.contractorPinSelected,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.pinIcon}>{TRADE_ICONS[trade] ?? '🔧'}</Text>
        {verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓</Text>
          </View>
        )}
        {(isLive || isOnline) && <View style={styles.onlineDot} />}
      </Animated.View>
      <View style={[styles.pinPointer, selected && styles.pinPointerSelected]} />
    </View>
  );
}

// ── JOB PIN ─────────────────────────────────────────────
export function JobPin({
  trade,
  urgency,
  selected,
  price,
}: BasePinProps & {
  trade: string;
  urgency?: 'low' | 'normal' | 'urgent';
  price?: number;
}) {
  const scaleAnim = useRef(new Animated.Value(selected ? 1.2 : 1)).current;
  const urgentPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: selected ? 1.25 : 1,
      friction: 5, tension: 80,
      useNativeDriver: true,
    }).start();
  }, [selected]);

  useEffect(() => {
    if (urgency === 'urgent') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(urgentPulse, {
            toValue: 1, duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(urgentPulse, {
            toValue: 0, duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [urgency]);

  const pulseScale = urgentPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const pulseOpacity = urgentPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.pinWrapper}>
      {urgency === 'urgent' && (
        <Animated.View
          style={[
            styles.pulse,
            {
              backgroundColor: '#FF6200',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.jobPin,
          selected && styles.jobPinSelected,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.pinIcon}>{TRADE_ICONS[trade] ?? '🔧'}</Text>
        {price && price > 0 && (
          <View style={styles.priceTag}>
            <Text style={styles.priceTagText}>
              ${price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price}
            </Text>
          </View>
        )}
      </Animated.View>
      <View style={[styles.jobPinPointer, selected && styles.jobPinPointerSelected]} />
    </View>
  );
}

// ── ME PIN (current user) ───────────────────────────────
export function MePin() {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 1800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0, duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 3] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={styles.mePinWrapper}>
      <Animated.View
        style={[
          styles.mePulse,
          { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
        ]}
      />
      <View style={styles.meInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrapper: { alignItems: 'center', width: 60, height: 76 },

  pulse: {
    position: 'absolute',
    width: 56, height: 56, borderRadius: 28,
    top: 0, left: 2,
  },

  contractorPin: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#0A0A0A',
    borderWidth: 3, borderColor: '#FF6200',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6200',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 10,
  },
  contractorPinSelected: {
    borderColor: '#FFB366',
    backgroundColor: '#FF6200',
    shadowOpacity: 0.9, shadowRadius: 14,
  },

  jobPin: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#FF6200',
    borderWidth: 3, borderColor: '#FFB366',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6200',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 10, elevation: 12,
  },
  jobPinSelected: {
    backgroundColor: '#FF8C30',
    shadowOpacity: 1, shadowRadius: 16,
  },

  pinIcon: { fontSize: 22 },

  verifiedBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#22C55E',
    borderWidth: 2, borderColor: '#0A0A0A',
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedText: { fontSize: 9, color: '#fff', fontWeight: '900' },

  onlineDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2, borderColor: '#0A0A0A',
  },

  pinPointer: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#FF6200',
  },
  pinPointerSelected: { borderTopColor: '#FFB366' },

  jobPinPointer: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#FF6200',
  },
  jobPinPointerSelected: { borderTopColor: '#FF8C30' },

  priceTag: {
    position: 'absolute', top: -14, right: -22,
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1.5, borderColor: '#FF6200',
  },
  priceTagText: {
    fontSize: 10, fontWeight: '900', color: '#FF6200',
  },

  // Me pin
  mePinWrapper: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  mePulse: {
    position: 'absolute', width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#3B82F6',
  },
  meInner: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#3B82F6',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 8, elevation: 8,
  },
});