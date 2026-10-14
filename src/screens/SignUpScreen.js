import React, { useState } from 'react';
import {View, Text, TextInput, TouchableOpacity, ScrollView} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import PasswordInput from '../components/PasswordInput';

import { supabase } from '../supabase/client';

export default function SignUpScreen({ navigation }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const onCreate = async () => {
    setError(null);
    if (!firstName || !lastName || !email || !password) {
      setError('Tous les champs sont obligatoires.');
      return;
    }
    try {
      const cleanEmail = email.trim();

      const { data, error: e } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        // Store first/last name in user_metadata so the DB trigger can
        // automatically insert the row into public.users.
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (e) throw e;

      // ✅ No insert into `profiles` anymore.
      // The insert into `public.users` is handled automatically by a DB trigger
      // that runs after auth signup.

      // If confirmation is required, user should confirm then login.
      navigation.navigate('Login');
    } catch (e) {
      setError(e?.message || 'Erreur de création de compte.');
    }
  };

  return (
    <GradientBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[common.container, { flexGrow: 1 }]} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <Text style={[common.title, { fontSize: 30 }]}>Create account</Text>
        <Text style={common.subtitle}>Sign up</Text>

        <View style={{ height: 18 }} />

        <View style={common.card}>
          <Text style={common.label}>First name</Text>
          <TextInput
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setError(null); }}
            placeholder="First name"
            placeholderTextColor={c.muted}
            style={common.input}
          />

          <Text style={common.label}>Last name</Text>
          <TextInput
            value={lastName}
            onChangeText={(t) => { setLastName(t); setError(null); }}
            placeholder="Last name"
            placeholderTextColor={c.muted}
            style={common.input}
          />

          <Text style={common.label}>New email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            placeholder="yourname@example.com"
            placeholderTextColor={c.muted}
            style={common.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={common.label}>Password</Text>
          <PasswordInput
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            placeholder="Create a password"
          />

          {error ? <Text style={common.error}>{error}</Text> : null}

          <TouchableOpacity style={common.button} onPress={onCreate}>
            <Text style={common.buttonText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Text style={{ color: c.orange, fontWeight: '800' }}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}
