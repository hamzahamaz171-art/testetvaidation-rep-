import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import AuthStack from './src/navigation/AuthStack';
import AppStack from './src/navigation/AppStack';
import IntroStack from './src/navigation/IntroStack';
import PublicReactionsStack from './src/navigation/PublicReactionsStack';
import { StatusBar } from 'expo-status-bar';

import { supabase } from './src/supabase/client';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { lightColors, darkColors } from './src/theme/colors';

function AppInner() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  // Allow QR deep-link /reactions to open ReactionsScreen even if the user isn't logged in.
  const [forceReactions, setForceReactions] = useState(false);
  const [authEntry, setAuthEntry] = useState('Login');
  const [forceReset, setForceReset] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [navReady, setNavReady] = useState(false);

  const navigationRef = useRef(null);

  const { theme } = useTheme();
  const navTheme = theme === 'light'
    ? {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: lightColors.bg, card: lightColors.card, text: lightColors.text, primary: lightColors.blue, border: lightColors.card2 },
      }
    : {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: darkColors.bg, card: darkColors.card, text: darkColors.text, primary: darkColors.blue, border: darkColors.card2 },
      };

  const getUrlParams = (url) => {
    try {
      const u = new URL(url);
      const params = new URLSearchParams(u.search || '');
      const hash = (u.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);
      return { params, hashParams };
    } catch (e) {
      return { params: new URLSearchParams(), hashParams: new URLSearchParams() };
    }
  };

  // If we open the app from a Supabase OAuth redirect, we must exchange the code for a session.
  // Otherwise you'll be sent back to the intro screens and the selected Google account won't be logged in.
  useEffect(() => {
    const handleUrl = async (url) => {
      if (!url) return;

      // ✅ Deep link (QR) -> open Reactions (buttons screen)
      // Example (Expo Go): exp://<LAN_IP>:8081/--/reactions?robotName=AdBot%20R1
      // Example (standalone): pi-mobile://reactions?robotName=AdBot%20R1
      try {
        const parsed = ExpoLinking.parse(url);
        // Expo Go often prefixes paths with "--/" (e.g. "--/reactions").
        const rawPath = String(parsed?.path || '');
        const cleanPath = rawPath.replace(/^--\//, '');
        const isReactionsPath =
          cleanPath === 'reactions' ||
          cleanPath === 'react' ||
          cleanPath.endsWith('/reactions') ||
          cleanPath.endsWith('/react') ||
          rawPath.includes('reactions') ||
          rawPath.includes('react');

        if (isReactionsPath) {
          setIntroDone(true);
          setForceReactions(true);
          setPendingNav({
            name: 'Reactions',
            params: { robotName: parsed?.queryParams?.robotName || 'AdBot R1' },
          });
          return;
        }
      } catch (e) {
        // ignore parse errors
      }

      const isRecoveryLink = url.includes('type=recovery') || url.includes('reset-password');
      const isAuthCallback =
        url.includes('code=') || url.includes('access_token=') || url.includes('refresh_token=');

      // Ignore unrelated links.
      if (!isAuthCallback && !isRecoveryLink) return;

      // Skip intro for this launch (so we don't lose the callback flow)
      setIntroDone(true);

      // Only recovery links should force ResetPassword.
      if (isRecoveryLink) {
        setAuthEntry('ResetPassword');
        setForceReset(true);
      }

      try {
        const { params, hashParams } = getUrlParams(url);
        const code = params.get('code') || hashParams.get('code');
        const access_token = params.get('access_token') || hashParams.get('access_token');
        const refresh_token = params.get('refresh_token') || hashParams.get('refresh_token');
        const recoveryType = params.get('type') || hashParams.get('type');
        const token_hash = params.get('token_hash') || hashParams.get('token_hash');

        // On Web we enable detectSessionInUrl in the Supabase client, so we avoid double-handling here.
        if (Platform.OS !== 'web') {
          if (code) {
            await supabase.auth.exchangeCodeForSession(url);
          } else if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          } else if (recoveryType === 'recovery' && token_hash) {
            await supabase.auth.verifyOtp({ type: 'recovery', token_hash });
          }
        }
      } catch (e) {
        console.warn('OAuth exchange error:', e?.message || e);
      }
    };


      // If user lands on /reset-password (web) we must force the reset UI even if a session exists.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // ✅ Web direct path: /reactions or /react must open ReactionsScreen (QR)
        if (
          window.location.pathname &&
          (window.location.pathname.startsWith('/reactions') || window.location.pathname.startsWith('/react'))
        ) {
          const params = new URLSearchParams(window.location.search || '');
          setIntroDone(true);
          setForceReactions(true);
          setPendingNav({
            name: 'Reactions',
            params: { robotName: params.get('robotName') || 'AdBot R1' },
          });
          return;
        }

        if (window.location.pathname && window.location.pathname.startsWith('/reset-password')) {
          setIntroDone(true);
          setAuthEntry('ResetPassword');
          setForceReset(true);
        }
      }

    // Web: current URL
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      handleUrl(window.location.href);
    }

    // Native: initial URL + listener
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub?.remove?.();
  }, []);

  // If a deep link arrives while the user is not yet in AppStack (intro/auth), we keep it and navigate once ready.
  useEffect(() => {
    if (!navReady) return;
    if (!pendingNav) return;
    if (!introDone) return;
    if (!user) return;
    try {
      navigationRef.current?.navigate?.(pendingNav.name, pendingNav.params);
      setPendingNav(null);
    } catch (e) {
      // ignore
    }
  }, [navReady, pendingNav, introDone, user]);

  useEffect(() => {
    let mounted = true;

    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.session?.user ?? null);
      setReady(true);
    });

    // Listen for auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setAuthEntry('Login');
      } else {
        // If we're not on the reset-password route anymore, allow the normal app stack again.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (!window.location.pathname?.startsWith('/reset-password')) {
            setForceReset(false);
          }
        } else {
          setForceReset(false);
        }
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <StatusBar style="light" />
      {/* Always show the 3 intro screens on every app opening */}
      {!introDone ? (
        <IntroStack onDone={() => setIntroDone(true)} />
      ) : forceReactions ? (
        <PublicReactionsStack />
      ) : (
        forceReset ? <AuthStack initialRouteName={'ResetPassword'} /> : (user ? <AppStack /> : <AuthStack initialRouteName={authEntry} />)
      )}
    </NavigationContainer>
  );
}


export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
