import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { TradeaseLogo } from '../components/TradeaseLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontFamily, Radius, Shadows } from '../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../hooks/useAuth';


export default function SplashScreen() {
  const { colors: Colors } = useTheme();
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    safe: { flex: 1, paddingHorizontal: 28 },

    bgImage: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      width: undefined,
      height: undefined,
    },
    bgOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(10,10,10,0.82)',
    },

    hero: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'flex-start',
      gap: 18,
    },
    hammer: {
      width: 72, height: 72,
      ...Shadows.glow,
    },
    wordmark: {
      fontSize: 38,
      fontWeight: '800',
      color: '#F0F0F0',
      letterSpacing: -1,
    },
    tagline: {
      fontSize: 22,
      fontFamily: FontFamily.semibold,
      color: '#DDD',
      lineHeight: 30,
      letterSpacing: -0.3,
      marginTop: 8,
    },

    ctaBlock: {
      gap: 12,
      paddingBottom: 18,
    },
    primaryBtn: {
      borderRadius: Radius.xl,
      overflow: 'hidden',
      ...Shadows.glow,
    },
    primaryGradient: {
      height: 60,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primaryText: {
      fontSize: 17,
      fontFamily: FontFamily.black,
      color: '#0A0A0A',
      letterSpacing: 0.3,
    },
    primaryArrow: {
      fontSize: 20,
      fontFamily: FontFamily.black,
      color: '#0A0A0A',
    },
    secondaryBtn: {
      height: 56,
      borderRadius: Radius.xl,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(20,20,20,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: {
      fontSize: 15,
      fontFamily: FontFamily.bold,
      color: Colors.white,
      letterSpacing: 0.2,
    },
    signInRow: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    signInText: {
      fontSize: 13,
      fontFamily: FontFamily.medium,
      color: '#888',
    },
    signInLink: {
      fontFamily: FontFamily.bold,
      color: Colors.orange,
    },
    legal: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
      color: '#666',
      textAlign: 'center',
      lineHeight: 16,
      paddingHorizontal: 16,
    },
    legalLink: {
      fontFamily: FontFamily.semibold,
      color: '#999',
    },
  });
  const router = useRouter();
  const { enterGuestMode } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const ctaSlide = useRef(new Animated.Value(60)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 600, useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0, friction: 8, tension: 60, useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(ctaFade, {
          toValue: 1, duration: 500, useNativeDriver: true,
        }),
        Animated.spring(ctaSlide, {
          toValue: 0, friction: 8, tension: 60, useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleGetStarted = () => {
    enterGuestMode();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      {/* Concrete background */}
      <Image
        source={require('../assets/concrete-bg.jpg')}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <View style={styles.bgOverlay} />

      <SafeAreaView style={styles.safe}>

        {/* Hero */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TradeaseLogo layout="column" iconSize={68} fontSize={34} gap={-6} showCopyright />

          <Text style={styles.tagline}>
            Hire trusted pros.{'\n'}Get jobs done right.
          </Text>
        </Animated.View>

        {/* CTAs */}
        <Animated.View
          style={[
            styles.ctaBlock,
            { opacity: ctaFade, transform: [{ translateY: ctaSlide }] },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={handleGetStarted}
          >
            <LinearGradient
              colors={['#FF7A1F', '#FF6200']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGradient}
            >
              <Text style={styles.primaryText}>Get Started</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/signup')}
          >
            <Text style={styles.secondaryText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signInRow}
            activeOpacity={0.7}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.signInText}>
              Already a member? <Text style={styles.signInLink}>Sign In</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink}>Terms</Text>{' '}and{' '}
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Text>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}
