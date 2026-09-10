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
import * as Sentry from '@sentry/react-native';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/Toast';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';

// Empty/undefined DSN makes this a documented no-op — safe before EXPO_PUBLIC_SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
});

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

function RootLayout() {
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
      if (event === 'SIGNED_OUT') router.replace('/login');
      // PASSWORD_RECOVERY navigation is handled by the deep-link effect below,
      // which already knows the outcome (ready vs. invalid vs. switched
      // account) and passes it as params. A second, param-less push here
      // would race it and can clobber those params.
    });
    return () => subscription.unsubscribe();
  }, []);

  // Password recovery deep link: tradease://reset-password?code=...&type=recovery
  // Supabase's resetPasswordForEmail (flowType: 'pkce') sends this. Nothing
  // auto-detects it -- detectSessionInUrl is false because RN has no
  // window.location -- so this is the only thing that turns the tapped link
  // into a session. exchangeCodeForSession only succeeds on the same device/
  // app install that originally requested the reset (the PKCE code verifier
  // it needs is stored locally, never travels in the email) -- see
  // https://supabase.com/docs/guides/auth/sessions/pkce-flow#limitations.
  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      if (queryParams?.type !== 'recovery') return;

      const code = Array.isArray(queryParams.code) ? queryParams.code[0] : queryParams.code;

      const { data: prevData } = await supabase.auth.getSession();
      const prevEmail = prevData.session?.user?.email ?? null;

      if (!code) {
        router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
        return;
      }

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error || !data.session) {
          router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
          return;
        }

        const newEmail = data.session.user.email ?? '';
        const params: Record<string, string> =
          prevEmail && prevEmail !== newEmail
            ? { switchedFrom: prevEmail, to: newEmail }
            : {};
        router.replace({ pathname: '/reset-password', params });
      } catch {
        router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
      }
    }

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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

          {/* ── Admin ── */}
          <Stack.Screen name="admin/index" />
          <Stack.Screen name="admin/verifications" />
          <Stack.Screen name="admin/disputes" />
          <Stack.Screen name="admin/refunds" />

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
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);