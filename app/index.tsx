import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { TradeaseLogo } from '../components/TradeaseLogo';


export default function IndexScreen() {
  const { colors: Colors } = useTheme();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoBlock: {
      alignItems: 'center',
      gap: 18,
    },
    hammer: {
      width: 92,
      height: 92,
    },
    wordmark: {
      fontSize: 32,
      fontWeight: '800',
      color: '#F0F0F0',
      letterSpacing: -0.8,
    },
  });
  const router = useRouter();
  const { user, loading, isGuest } = useAuth();

  const pulseAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (loading) return;
    // Small delay so the loading screen is felt, not flashed
    const t = setTimeout(() => {
      if (user) {
        router.replace('/(tabs)');
      } else if (isGuest) {
        router.replace('/(tabs)');
      } else {
        router.replace('/splash');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [loading, user, isGuest]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoBlock,
          { opacity: fadeAnim, transform: [{ scale: pulseAnim }] },
        ]}
      >
        <TradeaseLogo layout="column" iconSize={80} fontSize={32} gap={-6} showCopyright />
      </Animated.View>
    </View>
  );
}
