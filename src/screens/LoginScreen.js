import React, { useState } from 'react';
import {View, Text, TextInput, TouchableOpacity, ScrollView, Platform} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import GradientBackground from '../components/GradientBackground';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import PasswordInput from '../components/PasswordInput';

import { supabase } from '../supabase/client';

WebBrowser.maybeCompleteAuthSession();

function getProjectNameForProxy() {
  const owner =
    Constants.expoConfig?.owner ||
    Constants.manifest?.owner ||
    'hamzaarfaoui007';
  const slug =
    Constants.expoConfig?.slug ||
    Constants.manifest?.slug ||
    'pi-mobile';
  return `@${owner}/${slug}`;
}

function getGoogleRedirectTo() {
  if (Platform.OS === 'web') {
    return window.location.origin;
  }

  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    return AuthSession.makeRedirectUri({
      useProxy: true,
      projectNameForProxy: getProjectNameForProxy(),
    });
  }

  return AuthSession.makeRedirectUri({
    scheme: 'pi-mobile',
    path: 'auth/callback',
  });
}

function getUrlParams(url) {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search || '');
    const hash = (u.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    return { params, hashParams };
  } catch (e) {
    return { params: new URLSearchParams(), hashParams: new URLSearchParams() };
  }
}

export default function LoginScreen({ navigation }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const onLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError('Veuillez remplir email et mot de passe.');
      return;
    }
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      // navigation handled by auth listener in App.js
    } catch (e) {
      setError(e?.message || 'Erreur de connexion.');
    }
  };

  const onGoogleLogin = async () => {
    setError(null);
    try {
      const redirectTo = getGoogleRedirectTo();

      const { data, error: e } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          ...(Platform.OS !== 'web' ? { skipBrowserRedirect: true } : {}),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (e) throw e;
      if (Platform.OS === 'web') return;
      if (!data?.url) throw new Error('Google auth URL not generated.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success' && result.url) {
        const { params, hashParams } = getUrlParams(result.url);
        const code = params.get('code') || hashParams.get('code');
        const access_token = params.get('access_token') || hashParams.get('access_token');
        const refresh_token = params.get('refresh_token') || hashParams.get('refresh_token');

        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exErr) throw exErr;
        } else if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (setErr) throw setErr;
        } else {
          throw new Error('No auth code/tokens returned by Google redirect.');
        }
      }
    } catch (e) {
      setError(e?.message || 'Erreur Google sign-in.');
    }
  };

  return (
    <GradientBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[common.container, { flexGrow: 1 }]} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <Text style={common.title}>Hello Again!</Text>
        <Text style={common.subtitle}>Log in</Text>

        <View style={{ height: 18 }} />

        <View style={common.card}>
          <Text style={common.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            placeholder="name@email.com"
            placeholderTextColor={c.muted}
            style={common.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={common.label}>Password</Text>
          <PasswordInput
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            placeholder="••••••••"
          />

          {error ? <Text style={common.error}>{error}</Text> : null}

          <TouchableOpacity style={common.button} onPress={onLogin}>
            <Text style={common.buttonText}>Sign In</Text>
          </TouchableOpacity>

          <View style={common.row}>
            <Text style={{ color: c.muted }}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={common.link}>Sign up</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ marginTop: 10, alignItems: 'center' }}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={{ color: c.muted }}>
              Forgot password? <Text style={common.link}>Reset</Text>
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: 16, marginBottom: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' }} />

          <TouchableOpacity
            onPress={onGoogleLogin}
            style={{
              height: 52,
              borderRadius: 26,
              backgroundColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
          >
            <Text style={{ fontWeight: '800', color: '#000', fontSize: 16 }}>
              Continue with Google
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}
