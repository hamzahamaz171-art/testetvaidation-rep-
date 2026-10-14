import React, { useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import {View, Text, TextInput, TouchableOpacity, ScrollView, Platform} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import { supabase } from '../supabase/client';

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

function getResetRedirectTo() {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/reset-password`;
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
    path: 'reset-password',
  });
}

export default function ForgotPasswordScreen({ navigation }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const onSend = async () => {
    setError(null);
    setMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Veuillez entrer votre email.');
      return;
    }

    // Note: Supabase envoie un lien de réinitialisation par email.
    // Le lien redirige vers "Site URL" configurée dans Supabase (Auth > URL Configuration).
    // We include a redirect URL so the email link opens directly on the ResetPassword screen.
    const redirectTo = getResetRedirectTo();
    const { error: e } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });

    if (e) {
      setError(e.message || 'Erreur lors de l\'envoi.');
      return;
    }

    setMsg('Email envoyé. Vérifiez votre boîte mail (et spam).');
  };

  return (
    <GradientBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[common.container, { flexGrow: 1 }]} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <Text style={common.title}>Forgot password</Text>
        <Text style={common.subtitle}>Reset by email</Text>

        <View style={{ height: 18 }} />

        <View style={common.card}>
          <Text style={common.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
              setMsg(null);
            }}
            placeholder="name@email.com"
            placeholderTextColor={c.muted}
            style={common.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {error ? <Text style={common.error}>{error}</Text> : null}
          {msg ? <Text style={{ color: '#D0FFD0', marginTop: 8 }}>{msg}</Text> : null}

          <TouchableOpacity style={common.button} onPress={onSend}>
            <Text style={common.buttonText}>Send reset email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 12, alignItems: 'center' }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: c.orange, fontWeight: '800' }}>Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}
