import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/**
 * Small, unobtrusive logo badge.
 * Uses transparent PNG in assets/company_logo.png
 */
export default function AppLogo({ size = 28, style }) {
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <Image
        source={require('../../assets/company_logo.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
