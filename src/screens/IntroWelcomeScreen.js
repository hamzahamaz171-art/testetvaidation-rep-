import React from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import AppLogo from '../components/AppLogo';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import PageDots from '../components/PageDots';

export default function IntroWelcomeScreen({ onDone }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  return (
    <GradientBackground>
      <AppLogo size={44} style={{ position: 'absolute', top: 18, left: 18, opacity: 0.95 }} />
      <View style={[common.container, { justifyContent: 'center' }]}>
        <View style={common.card}>
          <Text style={[common.title, { fontSize: 30 }]}>Welcome 👋</Text>
          <Text style={[common.subtitle, { marginTop: 10 }]}>
            Your smart mobile robot companion for indoor advertising.
          </Text>

          <View style={{ height: 18 }} />

          <TouchableOpacity style={common.button} onPress={onDone}>
            <Text style={common.buttonText}>DIVE IN</Text>
          </TouchableOpacity>

          <View style={{ height: 16 }} />

          <View style={{ alignItems: 'center' }}>
            <PageDots index={2} total={3} />
            <Text style={{ color: c.muted, marginTop: 10, fontSize: 12 }}>
              You will see this intro every time you open the app.
            </Text>
          </View>
        </View>
      </View>
    </GradientBackground>
  );
}
