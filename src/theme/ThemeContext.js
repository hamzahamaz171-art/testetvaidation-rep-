import React, { createContext, useContext, useEffect, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    // Enable LayoutAnimation on Android
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const toggleTheme = () => {
    // Smooth transition on theme switch ✨
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
