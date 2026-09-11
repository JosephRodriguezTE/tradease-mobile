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

// Module-level, not a ref: must survive independently of how many times the
// deep-link effect below runs, and must be visible to both handleUrl
// invocations (getInitialURL + the 'url' event) regardless of which one the
// effect closure captured. PKCE codes are single-use and short-lived, so
// this only ever needs to hold a couple of entries at a time.
const handledCodes = new Set<string>();

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
  //
  // On a cold start, Linking.getInitialURL() and the very first
  // Linking.addEventListener('url', ...) callback both deliver the SAME
  // launch URL -- a known RN/Android Linking behavior, not a StrictMode or
  // effect-remount artifact (this app doesn't use StrictMode anywhere, and
  // this is a production build besides, where React doesn't double-invoke
  // effects regardless). Without a guard, both calls raced to exchange the
  // identical one-time-use PKCE code: whichever reached Supabase first
  // actually got a session, the other got a real failure back, and
  // whichever call's router.replace happened to resolve LAST won the
  // screen -- which was consistently the failing one, so the user always
  // saw "invalid" even on a run where the exchange genuinely succeeded.
  // handledCodes is module-level (not a ref) so it survives regardless of
  // how many times this effect itself runs, and the check-and-claim below
  // happens synchronously, before any await, so the second invocation
  // -- whichever call that turns out to be -- always sees the code already
  // claimed and bails before ever touching the network.
  useEffect(() => {
    async function handleUrl(url: string | null, source: 'getInitialURL' | 'urlEvent') {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      console.log(`[password-recovery] ${source}: received url, type=${queryParams?.type ?? 'none'}`);
      if (queryParams?.type !== 'recovery') return;

      const code = Array.isArray(queryParams.code) ? queryParams.code[0] : queryParams.code;

      if (!code) {
        console.log(`[password-recovery] ${source}: recovery link has no code param`);
        router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
        return;
      }

      const shortCode = code.slice(0, 8);

      // Synchronous claim -- must happen before the first await below.
      if (handledCodes.has(code)) {
        console.log(`[password-recovery] ${source}: code ${shortCode}... already handled, skipping`);
        return;
      }
      handledCodes.add(code);
      console.log(`[password-recovery] ${source}: claimed code ${shortCode}..., starting exchange`);

      const { data: prevData } = await supabase.auth.getSession();
      const prevEmail = prevData.session?.user?.email ?? null;

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error || !data.session) {
          console.log(`[password-recovery] ${source}: exchange FAILED for ${shortCode}... -- ${error?.message ?? 'no session returned'}`);
          router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
          return;
        }

        console.log(`[password-recovery] ${source}: exchange SUCCEEDED for ${shortCode}..., user=${data.session.user.email}`);

        const newEmail = data.session.user.email ?? '';
        const params: Record<string, string> =
          prevEmail && prevEmail !== newEmail
            ? { switchedFrom: prevEmail, to: newEmail }
            : {};
        router.replace({ pathname: '/reset-password', params });
      } catch (err: any) {
        console.log(`[password-recovery] ${source}: exchange THREW for ${shortCode}... -- ${err?.message ?? String(err)}`);
        router.replace({ pathname: '/reset-password', params: { invalid: '1' } });
      }
    }

    Linking.getInitialURL().then((url) => handleUrl(url, 'getInitialURL'));
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url, 'urlEvent'));
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