import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastItem extends ToastConfig {
  id: number;
}

const TYPE_COLOR: Record<ToastType, string> = {
  info:    '#2196F3',
  success: '#22C55E',
  warning: '#FBBF24',
  error:   '#EF4444',
};

const TYPE_ICON: Record<ToastType, string> = {
  info:    'ℹ',
  success: '✓',
  warning: '⚠',
  error:   '✕',
};

let _enqueue: ((config: ToastConfig) => void) | null = null;

export function showToast(config: ToastConfig) {
  _enqueue?.(config);
}

let _toastId = 0;

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const type = item.type ?? 'info';
  const accentColor = TYPE_COLOR[type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => dismiss(), item.duration ?? 3500);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss(item.id));
  }

  return (
    <Animated.View
      style={[styles.toast, { transform: [{ translateY: slideY }], opacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Text style={[styles.icon, { color: accentColor }]}>{TYPE_ICON[type]}</Text>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        {item.message ? (
          <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
        ) : null}
        {item.action ? (
          <Pressable
            onPress={() => { item.action!.onPress(); dismiss(); }}
            accessibilityRole="button"
            accessibilityLabel={item.action.label}
          >
            <Text style={[styles.actionLabel, { color: accentColor }]}>{item.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={dismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
      >
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const enqueue = useCallback((config: ToastConfig) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev.slice(-2), { ...config, id }]);
  }, []);

  useEffect(() => {
    _enqueue = enqueue;
    return () => { _enqueue = null; };
  }, [enqueue]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </View>
    </>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  toast: {
    width: Math.min(width - 32, 400),
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  icon: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    paddingTop: 12,
    paddingLeft: 10,
    paddingRight: 4,
  },
  body: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  message: {
    color: '#AAAAAA',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    lineHeight: 18,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 6,
  },
  close: {
    color: '#666',
    fontSize: 13,
    padding: 12,
    paddingTop: 13,
  },
});
