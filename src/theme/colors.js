// Theme palettes tuned to match the requested "pastel light" + "deep navy" styles.
// Keep key names stable (blue/orange/bg/card/...) so existing UI stays intact.

export const lightColors = {
  // Primary / accents
  blue: '#4A8DFF',
  orange: '#F59E0B',

  // Backgrounds
  bg: '#EAF3FF',
  bg2: '#F6FBFF',

  // Surfaces (cards/inputs)
  card: 'rgba(255,255,255,0.55)',
  card2: 'rgba(255,255,255,0.78)',

  // Text
  text: '#0F1E3A',
  muted: 'rgba(15,30,58,0.62)',

  // Borders
  border: 'rgba(15,30,58,0.10)',
  border2: 'rgba(15,30,58,0.14)',

  danger: '#DC2626',
};

export const darkColors = {
  // Primary / accents
  blue: '#3D7BFF',
  orange: '#F59E0B',

  // Backgrounds
  bg: '#0B1226',
  bg2: '#070B18',

  // Surfaces (cards/inputs)
  card: 'rgba(255,255,255,0.07)',
  card2: 'rgba(255,255,255,0.11)',

  // Text
  text: '#E6EDFF',
  muted: 'rgba(230,237,255,0.72)',

  // Borders
  border: 'rgba(255,255,255,0.10)',
  border2: 'rgba(255,255,255,0.14)',

  danger: '#FF6B6B',
};

export const getColors = (theme) => (theme === 'light' ? lightColors : darkColors);

// Backward compatibility (old code): default to dark
export const COLORS = darkColors;
