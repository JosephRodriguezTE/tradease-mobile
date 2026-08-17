import { ThemeProvider } from '@/context/ThemeContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/Toast';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';

SplashScreen.preventAutoHideAsync().catch(() => {});

function applyDefaultFont() {
  const TextAny = Text as any;
  TextAny.defaultProps = TextAny.defaultProps ?? {};
  TextAny.defaultProps.style = [
    { fontFamily: 'Inter_500Medium' },
    TextAny.defaultProps.style,
  ];

  const InputAny = TextInput as any;
  InputAny.defaultProps = InputAny.defaultProps ?? {};
  InputAny.defaultProps.style = [
    { fontFamily: 'Inter_500Medium' },
    InputAny.defaultProps.style,
  ];
}

function NotificationsBootstrap() {
  useNotifications();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) {
      applyDefaultFont();
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT')        router.replace('/login');
      if (event === 'PASSWORD_RECOVERY') router.push('/reset-password');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ToastProvider>
        <NotificationsBootstrap />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {/* ── Core ── */}
          <Stack.Screen name="index" />
          <Stack.Screen name="splash" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="2fa-verify" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="reset-password" />

          {/* ── Onboarding ── */}
          <Stack.Screen name="onboarding/customer" />

          {/* ── Main tabs ── */}
          <Stack.Screen name="(tabs)" />

          {/* ── Jobs & chat ── */}
          <Stack.Screen name="job/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="create-job"       options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="find-contractor" />
          <Stack.Screen name="notifications" />

          {/* ── Profile & settings ── */}
          <Stack.Screen name="profile/edit"          options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="profile/personal-info" />
          <Stack.Screen name="profile/notifications" />
          <Stack.Screen name="profile/payments" />
          <Stack.Screen name="profile/privacy" />
          <Stack.Screen name="profile/settings" />
          <Stack.Screen name="profile/contact" />
          <Stack.Screen name="profile/terms" />
          <Stack.Screen name="profile/change-password" />
          <Stack.Screen name="profile/security" />
          <Stack.Screen name="profile/company-setup" />
          <Stack.Screen name="profile/employees" />
          <Stack.Screen name="profile/get-verified" />
          <Stack.Screen name="profile/verification-status" />
          <Stack.Screen name="profile/company-profile" />
          <Stack.Screen name="profile/subscription" />
          <Stack.Screen name="profile/calendar" />
          <Stack.Screen name="profile/portfolio" />
          <Stack.Screen name="profile/completed-work" />
          <Stack.Screen name="profile/analytics" />
          <Stack.Screen name="profile/earnings" />

          {/* ── Referrals ── */}
          <Stack.Screen name="referrals" />

          {/* ── Invite ── */}
          <Stack.Screen name="invite/[token]" options={{ animation: 'slide_from_bottom' }} />

          {/* ── Company ── */}
          <Stack.Screen name="company/[id]" />

          {/* ── Work orders ── */}
          <Stack.Screen name="work-order/contractor" />
          <Stack.Screen name="work-order/customer" />
          <Stack.Screen name="work-order/chat" />
          <Stack.Screen name="work-order/receipt" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
        </ToastProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}