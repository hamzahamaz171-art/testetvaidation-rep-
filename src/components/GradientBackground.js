import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useThemeColors } from '../theme/useThemeColors';

export default function GradientBackground({ children }) {
  const { theme, toggleTheme } = useTheme();
  const c = useThemeColors();

  const gradientColors = theme === 'dark'
    ? [
        `${c.blue}22`,
        `${c.blue}10`,
        `${(c.bg2 || c.bg)}FF`,
        `${c.bg}FF`,
      ]
    : [
        `${c.blue}28`,
        `${c.blue}14`,
        `${c.orange}14`,
        `${(c.bg2 || c.bg)}FF`,
      ];

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.9, y: 1.0 }}
      >
        <TouchableOpacity onPress={toggleTheme} style={[styles.toggle, { backgroundColor: c.card }]}>
          <Text style={[styles.toggleText, { color: c.orange }]}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>

        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gradient: { flex: 1 },
  toggle: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 999,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 18 },
});
