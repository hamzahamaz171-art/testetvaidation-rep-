import { StyleSheet } from 'react-native';
import { darkColors } from './colors';

export const makeCommon = (c) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { color: c.text, fontSize: 34, fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { color: c.muted, fontSize: 16, marginTop: 6 },
  card: {
    backgroundColor: c.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border ?? 'rgba(255,255,255,0.06)',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: c.card2,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border2 ?? 'rgba(255,255,255,0.08)',
  },
  button: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.blue,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  link: { color: c.orange, fontWeight: '700' },
});

// Backward compatibility: old imports keep working (dark by default)
export const common = makeCommon(darkColors);
