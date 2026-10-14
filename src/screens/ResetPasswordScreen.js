import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform } from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';

function getUrlParams(url) {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    // Supabase often sends tokens in hash fragment
    const hash = (u.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    return { params, hashParams };
  } catch (e) {
    return { params: new URLSearchParams(), hashParams: new URLSearchParams() };
  }
}

export default function ResetPasswordScreen({ navigation }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Ensure we have an auth session from the recovery link before allowing updateUser().
  useEffect(() => {
    let cancelled = false;

    const ensureSession = async () => {
      try {
        // If already have a session, we're good.
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          if (!cancelled) setSessionReady(true);
          return;
        }

        // On web, the recovery redirect may include code/tokens in the current URL.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const url = window.location.href;
          const { params, hashParams } = getUrlParams(url);

          // If Supabase redirected with an error (e.g., expired/used link), show it clearly.
          const err = params.get('error') || hashParams.get('error');
          const errCode = params.get('error_code') || hashParams.get('error_code');
          const errDescRaw = params.get('error_description') || hashParams.get('error_description');
          if (err || errCode) {
            const errDesc = (errDescRaw || '').replace(/\+/g, ' ');
            if (!cancelled) {
              setError(errDesc || 'Lien de réinitialisation invalide ou expiré. Veuillez refaire "Forgot password".');
              setSessionReady(false);
            }
            return;
          }


          // Prefer PKCE code exchange if present
          const code = params.get('code') || hashParams.get('code');
          const recoveryType = params.get('type') || hashParams.get('type');
          const token_hash = params.get('token_hash') || hashParams.get('token_hash');
          if (code) {
            await supabase.auth.exchangeCodeForSession(url);

            // Clean URL to avoid reusing the one-time code on refresh
            try { window.history.replaceState(null, '', '/reset-password'); } catch (e) {}
          } else if (recoveryType === 'recovery' && token_hash) {
            await supabase.auth.verifyOtp({ type: 'recovery', token_hash });
            try { window.history.replaceState(null, '', '/reset-password'); } catch (e) {}
          } else {
            // Or directly set session from tokens if provided
            const access_token = hashParams.get('access_token') || params.get('access_token');
            const refresh_token = hashParams.get('refresh_token') || params.get('refresh_token');
            if (access_token && refresh_token) {
              await supabase.auth.setSession({ access_token, refresh_token });
              try { window.history.replaceState(null, '', '/reset-password'); } catch (e) {}
            }
          }

          const { data: after } = await supabase.auth.getSession();
          if (after?.session) {
            if (!cancelled) setSessionReady(true);
            return;
          }
        }

        // Native: App.js already listens to Linking and exchanges the session.
        // We just check again shortly.
        const { data: retry } = await supabase.auth.getSession();
        if (retry?.session) {
          if (!cancelled) setSessionReady(true);
        } else {
          if (!cancelled) setSessionReady(false);
        }
      } catch (e) {
        if (!cancelled) {
          setSessionReady(false);
        }
      }
    };

    ensureSession();
    return () => { cancelled = true; };
  }, []);

  const onUpdate = async () => {
    setError(null);
    setMsg(null);

    if (!sessionReady) {
      setError('Auth session missing! Ouvrez le lien de reset depuis votre email.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Mot de passe: minimum 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) {
        setError(e.message || 'Erreur lors de la mise à jour.');
        return;
      }

      setMsg('Mot de passe mis à jour ✅');
      // Optional: sign out to force fresh login
      await supabase.auth.signOut();

      // On web, clean URL so we don't re-trigger recovery state
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.history.replaceState({}, document.title, '/');
        } catch {}
      }

      navigation.navigate('Login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[common.container, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={common.title}>Reset password</Text>
        <Text style={common.subtitle}>Choose a new password</Text>

        <View style={{ height: 18 }} />

        <View style={common.card}>
          <Text style={common.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
              setMsg(null);
            }}
            placeholder="New password"
            placeholderTextColor={c.muted}
            style={common.input}
            secureTextEntry
          />

          <Text style={[common.label, { marginTop: 14 }]}>Confirm password</Text>
          <TextInput
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              setError(null);
              setMsg(null);
            }}
            placeholder="Confirm password"
            placeholderTextColor={c.muted}
            style={common.input}
            secureTextEntry
          />

          {error ? <Text style={common.error}>{error}</Text> : null}
          {msg ? <Text style={{ color: '#D0FFD0', marginTop: 8 }}>{msg}</Text> : null}

          <TouchableOpacity style={common.button} onPress={onUpdate} disabled={loading}>
            <Text style={common.buttonText}>{loading ? 'Please wait...' : 'Update password'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 12, alignItems: 'center' }}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={{ color: c.orange, fontWeight: '800' }}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}
