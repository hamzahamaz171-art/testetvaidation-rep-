import { useMemo } from 'react';
import { useTheme } from './ThemeContext';
import { getColors } from './colors';

export const useThemeColors = () => {
  const { theme } = useTheme();
  return useMemo(() => getColors(theme), [theme]);
};
