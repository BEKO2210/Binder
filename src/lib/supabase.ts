import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

import { LargeSecureStore } from './secureSessionStorage';

import type { Database } from '../types/database';

const DEFAULT_URL = 'https://sbohsxtzitqhyswznhec.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_CS84Z2jb7tQZBk97sFpPCw_9smErm5J';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? DEFAULT_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: new LargeSecureStore() } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
