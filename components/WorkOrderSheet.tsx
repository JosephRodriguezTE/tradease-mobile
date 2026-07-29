// components/WorkOrderSheet.tsx
// Animated bottom sheet for the Uber-style map stage on the customer work order screen.
// Three snap points: collapsed (status + ETA strip), half (bill + chat), full (all sections).
// Built on Animated + PanResponder — no extra dependencies.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');

// Snap points: distance from the TOP of the screen to where the sheet's top edge lands.
// Collapsed = only the peeking strip shows; Full = sheet covers most of screen.
export const SNAPS = {
  collapsed: SCREEN_H - 130,
  half:      SCREEN_H - 400,
  full:      80,   // leave 80px of map peeking above sheet when fully open
} as const;

export type SnapPoint = keyof typeof SNAPS;

export interface WorkOrderSheetRef {
  snapTo: (snap: SnapPoint) => void;
}

interface WorkOrderSheetProps {
  /** Always-visible strip rendered below the drag handle (avatar, ETA, status). */
  header: React.ReactNode;
  /** Full section content shown when half or fully expanded. */
  children: React.ReactNode;
  initialSnap?: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
  topInset?: number;
}

export function WorkOrderSheet({
  header,
  children,
  initialSnap = 'collapsed',
  onSnapChange,
  topInset = 0,
}: WorkOrderSheetProps) {
  const snapValues = {
    collapsed: SNAPS.collapsed,
    half:      SNAPS.half,
    full:      Math.max(SNAPS.full, topInset + 16),
  };

  const translateY = useRef(new Animated.Value(snapValues[initialSnap])).current;
  const lastOffset = useRef(snapValues[initialSnap]);
  const currentSnap = useRef<SnapPoint>(initialSnap);
  const [snap, setSnap] = useState<SnapPoint>(initialSnap);

  const springTo = useCallback((target: SnapPoint) => {
    const toValue = snapValues[target];
    lastOffset.current = toValue;
    currentSnap.current = target;
    setSnap(target);
    Animated.spring(translateY, {
      toValue,
      tension: 75,
      friction: 11,
      useNativeDriver: false,
    }).start();
    onSnapChange?.(target);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderGrant: () => {
        translateY.setOffset(lastOffset.current);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, { dy }) => {
        // Clamp: don't allow dragging above the full snap or far below the collapsed snap
        const raw = lastOffset.current + dy;
        const clamped = Math.max(snapValues.full - 20, Math.min(snapValues.collapsed + 60, raw));
        translateY.setValue(clamped - lastOffset.current);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        translateY.flattenOffset();
        const current = lastOffset.current + dy;

        const snaps: SnapPoint[] = ['full', 'half', 'collapsed'];
        let target: SnapPoint;

        if (vy < -0.6) {
          // Fast swipe up → open one level
          const idx = snaps.indexOf(currentSnap.current);
          target = snaps[Math.max(0, idx - 1)];
        } else if (vy > 0.6) {
          // Fast swipe down → close one level
          const idx = snaps.indexOf(currentSnap.current);
          target = snaps[Math.min(snaps.length - 1, idx + 1)];
        } else {
          // Nearest snap wins
          const dists = snaps.map(s => ({ s, d: Math.abs(snapValues[s] - current) }));
          dists.sort((a, b) => a.d - b.d);
          target = dists[0].s;
        }

        // Must update lastOffset before springTo reads it
        lastOffset.current = snapValues[currentSnap.current];
        springTo(target);
      },
    })
  ).current;

  // Expose imperative snapTo on the ref — caller uses sheetRef.current?.snapTo(...)
  // (We can't use forwardRef easily with function + hooks pattern; export springTo instead)
  useEffect(() => {
    (WorkOrderSheet as any)._springTo = springTo;
  }, [springTo]);

  const isExpanded = snap !== 'collapsed';

  return (
    <Animated.View
      style={[styles.sheet, { transform: [{ translateY }] }]}
    >
      {/* Drag handle */}
      <View style={styles.handleWrap} {...panResponder.panHandlers}>
        <View style={styles.handle} />
      </View>

      {/* Always-visible header strip */}
      <View {...panResponder.panHandlers}>
        {header}
      </View>

      {/* Expanded content — only scrollable when sheet is at half/full */}
      {isExpanded && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={snap === 'full'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      )}
    </Animated.View>
  );
}

/** Imperatively snap the sheet from outside. Call WorkOrderSheet.snapTo('half'). */
export function snapSheet(snap: SnapPoint) {
  (WorkOrderSheet as any)._springTo?.(snap);
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: -200,   // extra padding so spring overshoot doesn't reveal background
    backgroundColor: '#161616',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3A',
  },
  body: {
    flex: 1,
  },
});
