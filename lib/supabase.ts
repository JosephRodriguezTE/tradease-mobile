import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://linqsojbszglbgpoxgtv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpbnFzb2pic3pnbGJncG94Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDEyMDcsImV4cCI6MjA4OTcxNzIwN30.TfvKH1iNznTFyTpxpqTf7EbrG-L7YnbAxPeUXfnGirU';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// expo-secure-store has no web implementation — SecureStore is a native-only
// concept, and its web shim throws (`getValueWithKeyAsync is not a
// function`) on every call, which crashes Expo Router's server-side render
// for static web output since this file runs during that pass too. Fall
// back to localStorage on web, which is what Supabase's own browser client
// normally uses anyway. Native behavior (iOS/Android) is unchanged.
const WebStorageAdapter = {
  getItem: (key: string) =>
    Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const authStorage = Platform.OS === 'web' ? WebStorageAdapter : SecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});