import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[{ width: width as any, height, borderRadius, backgroundColor: '#2A2A2A', opacity }, style]}
    />
  );
}

export function SkeletonSectionCard() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={24} height={24} borderRadius={4} />
        <Skeleton width="55%" height={16} style={{ marginLeft: 10 }} />
        <Skeleton width={60} height={20} borderRadius={10} style={{ marginLeft: 'auto' }} />
      </View>
      <Skeleton width="100%" height={1} style={{ marginVertical: 12 }} />
      <Skeleton width="90%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="80%" height={14} />
    </View>
  );
}

export function SkeletonHero() {
  return (
    <View style={styles.card}>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Skeleton width={120} height={32} borderRadius={16} style={{ marginBottom: 12 }} />
        <Skeleton width="75%" height={18} style={{ marginBottom: 8 }} />
        <Skeleton width="60%" height={14} />
      </View>
      <View style={[styles.protectedBox, { marginTop: 16 }]}>
        <Skeleton width={120} height={22} borderRadius={4} style={{ marginBottom: 8 }} />
        <Skeleton width="85%" height={14} style={{ marginBottom: 6 }} />
        <Skeleton width="65%" height={14} />
      </View>
    </View>
  );
}

export function SkeletonContractorCard() {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Skeleton width={56} height={56} borderRadius={28} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Skeleton width="60%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="40%" height={13} />
        </View>
      </View>
      <Skeleton width="100%" height={40} borderRadius={8} />
    </View>
  );
}

export function SkeletonBillSection() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={24} height={24} borderRadius={4} />
        <Skeleton width="40%" height={16} style={{ marginLeft: 10 }} />
      </View>
      <Skeleton width="100%" height={1} style={{ marginVertical: 12 }} />
      {[0.9, 0.75, 0.85].map((w, i) => (
        <View key={i} style={styles.billRow}>
          <Skeleton width={`${w * 55}%` as any} height={14} />
          <Skeleton width={50} height={14} />
        </View>
      ))}
      <Skeleton width="100%" height={1} style={{ marginVertical: 12 }} />
      <View style={styles.billRow}>
        <Skeleton width="35%" height={18} />
        <Skeleton width={70} height={18} />
      </View>
    </View>
  );
}

export function SkeletonChecklist() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={24} height={24} borderRadius={4} />
        <Skeleton width="50%" height={16} style={{ marginLeft: 10 }} />
        <Skeleton width={48} height={20} borderRadius={10} style={{ marginLeft: 'auto' }} />
      </View>
      <Skeleton width="100%" height={1} style={{ marginVertical: 12 }} />
      <Skeleton width="100%" height={8} borderRadius={4} style={{ marginBottom: 14 }} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.checkRow}>
          <Skeleton width={20} height={20} borderRadius={4} />
          <Skeleton width={`${[65, 80, 55, 70][i]}%` as any} height={14} style={{ marginLeft: 12 }} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonTimeline() {
  return (
    <View style={styles.card}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.timelineRow}>
          <Skeleton width={8} height={8} borderRadius={4} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Skeleton width="70%" height={13} style={{ marginBottom: 4 }} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectedBox: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    padding: 14,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
});
