// components/NoAccountOverlay.tsx
// Blurred overlay shown over any screen when user has no account / not logged in.
// Usage: wrap screen content, pass `visible` prop.

import { useTheme } from '@/context/ThemeContext';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated, Image, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

interface Props {
  visible: boolean;
}

export default function NoAccountOverlay({ visible }: Props) {
  const router = useRouter();
  const { colors: C, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity, zIndex: 100 }]}>
      <BlurView
        intensity={isDark ? 60 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Overlay card */}
      <View style={styles.wrap}>
        {/* Logo area */}
        <Image
          source={require('../assets/tradease-icon.png')}
          style={{ width: 72, height: 72 }}
          resizeMode="contain"
        />

        <Text style={[styles.appName, { color: C.textPrimary }]}>
          Tradease<Text style={styles.appNameTm}>™</Text>
        </Text>
        <Text style={[styles.heading, { color: C.textPrimary }]}>Need an account?</Text>
        <Text style={[styles.sub, { color: C.textSecondary }]}>
          Create a free account to book contractors, track jobs, and manage payments — all in one place.
        </Text>

        {/* CTAs */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.orange }]}
          onPress={() => router.push('/signup')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: C.border, backgroundColor: C.surface }]}
          onPress={() => router.push('/login')}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryBtnText, { color: C.textPrimary }]}>Log In</Text>
        </TouchableOpacity>

        <Text style={[styles.legal, { color: C.textMuted }]}>
          By creating an account you agree to our{' '}
          <Text style={{ color: C.orange }}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={{ color: C.orange }}>Privacy Policy</Text>.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap:           { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:32 },
  logoBox:        { width:72, height:72, borderRadius:20, borderWidth:1, alignItems:'center', justifyContent:'center', marginBottom:16 },
  appName:        { fontSize:13, fontWeight:'700', letterSpacing:3, textTransform:'uppercase', color:'#FF6200', marginBottom:10 },
  appNameTm:      { fontSize:8, fontWeight:'800', color:'#FF6200', opacity:0.65, textTransform:'none', letterSpacing:0 },
  heading:        { fontSize:28, fontWeight:'800', textAlign:'center', marginBottom:10, letterSpacing:-0.5 },
  sub:            { fontSize:15, textAlign:'center', lineHeight:22, marginBottom:32 },
  primaryBtn:     { width:'100%', borderRadius:14, paddingVertical:16, alignItems:'center', marginBottom:12 },
  primaryBtnText: { fontSize:16, fontWeight:'800', color:'#fff' },
  secondaryBtn:   { width:'100%', borderRadius:14, paddingVertical:16, alignItems:'center', borderWidth:1, marginBottom:24 },
  secondaryBtnText:{ fontSize:16, fontWeight:'600' },
  legal:          { fontSize:12, textAlign:'center', lineHeight:18 },
});