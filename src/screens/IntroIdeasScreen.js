import React from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import AppLogo from '../components/AppLogo';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import PageDots from '../components/PageDots';

export default function IntroIdeasScreen({ navigation }) {
  const c = useThemeColors();
  const common = makeCommon(c);
  return (
    <GradientBackground>
      <AppLogo size={44} style={{ position: 'absolute', top: 18, left: 18, opacity: 0.95 }} />
      <View style={[common.container, { justifyContent: 'center' }]}>
        <View style={common.card}>
          <Text style={[common.title, { fontSize: 26 }]}>What can you do?</Text>
          <Text style={[common.subtitle, { marginTop: 10 }]}>
            • Discover promotions in restaurants, malls, hotels…{"\n"}
            • Interact with the robot: feedback buttons & notifications{"\n"}
            • Get a friendly guided experience indoors{"\n"}
            • Simple and secure account access
          </Text>

          <View style={{ height: 18 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <PageDots index={1} total={3} />
            <TouchableOpacity onPress={() => navigation.navigate('IntroWelcome')}>
              <Text style={{ color: c.orange, fontWeight: '900', fontSize: 16 }}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </GradientBackground>
  );
}
