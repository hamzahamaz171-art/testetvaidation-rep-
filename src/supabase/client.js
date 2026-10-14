import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// ✅ PI MOBILE (shared project)
// Replace with your own Project URL + anon key if needed.
const SUPABASE_URL = 'https://ucqwbfvlsstqyxssvwtl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcXdiZnZsc3N0cXl4c3N2d3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDU4MTEsImV4cCI6MjA4NjU4MTgxMX0.MOFaXuvPa6bpJfFbYJtasIaL_xlFfNdOYJ7mK1SubfA';

// ✅ Web needs localStorage for stable login/logout + recovery flows.
// ✅ Native keeps AsyncStorage.
const storage = Platform.OS === 'web'
  ? (typeof window !== 'undefined' ? window.localStorage : undefined)
  : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // ✅ On Web, Supabase can automatically parse the recovery callback URL.
    detectSessionInUrl: Platform.OS === 'web',
    // Expo Go does not provide full WebCrypto support for PKCE SHA-256.
    // Keep PKCE on web, use implicit flow on native for reliable deep-link auth.
    flowType: Platform.OS === 'web' ? 'pkce' : 'implicit',
  },
});
