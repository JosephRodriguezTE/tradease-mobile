// ─── Google Sign-In setup ─────────────────────────────────────────────────────
//
// HOW TO CONFIGURE GOOGLE OAUTH:
//
// 1. Google Cloud Console (https://console.cloud.google.com)
//    → Create or select a project
//    → APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID
//    → Create two credentials:
//        • iOS — bundle ID: com.tradease.app
//        • Android — package: com.tradease.app + your SHA-1 debug fingerprint
//          (run: keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey)
//        • Web — add Supabase callback URL as authorized redirect URI:
//          https://<your-project>.supabase.co/auth/v1/callback
//
// 2. Supabase Dashboard → Authentication → Providers → Google
//    → paste the Web Client ID and Client Secret
//
// 3. Copy the iOS client ID into .env:
//    EXPO_PUBLIC_GOOGLE_CLIENT_ID=<your-ios-client-id>.apps.googleusercontent.com
//
// 4. In app.json, replace "your-client-id-here" in the scheme array and
//    intentFilters with your reversed iOS client ID:
//    e.g.  com.googleusercontent.apps.<your-ios-client-id>
//
// Until a real client ID is set, signInWithGoogle() returns { notConfigured: true }
// and the sign-in button shows an informational Alert.
// ─────────────────────────────────────────────────────────────────────────────

import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Reads from .env (EXPO_PUBLIC_ prefix makes it available in the JS bundle)
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// True only when a real client ID has been pasted in — gates the OAuth flow
export const isGoogleConfigured =
  GOOGLE_CLIENT_ID.length > 0 && GOOGLE_CLIENT_ID !== 'your-client-id-here';

export interface GoogleAuthResult {
  session: Session | null;
  isNewUser: boolean;
  cancelled?: boolean;
  prefill?: { email: string; fullName: string };
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  const redirectUrl = Linking.createURL('/auth-callback');
  console.log('[googleAuth] redirectUrl =', redirectUrl);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type !== 'success') {
    return { session: null, isNewUser: false, cancelled: true };
  }

  // Parse the auth code from the callback URL
  const url = result.url;
  const codeMatch = url.match(/[?&]code=([^&#]+)/);
  if (!codeMatch) throw new Error('No authorization code in callback');
  const code = decodeURIComponent(codeMatch[1]);

  // Exchange code for a real session
  const { data: exchData, error: exchErr } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchErr) throw exchErr;
  if (!exchData.session) throw new Error('Failed to create session');

  const sessionUser = exchData.session.user;
  const userId = sessionUser.id;

  // Does this user already have a profile row?
  const { data: userP } = await supabase
    .from('users').select('id').eq('id', userId).maybeSingle();
  const { data: contractorP } = await supabase
    .from('contractors').select('id').eq('id', userId).maybeSingle();

  const meta = sessionUser.user_metadata ?? {};
  const fullName: string =
    meta.full_name ||
    meta.name ||
    [meta.given_name, meta.family_name].filter(Boolean).join(' ') ||
    '';

  return {
    session: exchData.session,
    isNewUser: !userP && !contractorP,
    prefill: {
      email: sessionUser.email ?? '',
      fullName,
    },
  };
}