import type { TextStyle } from 'react-native';

export const COLORS = {
  background: '#0B0C0E',
  elevated: '#16171B',
  card: '#18191E',
  cardPress: '#23252B',
  pill: '#16171B',
  green: '#1ED760',
  accent: '#9066FE',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8F9D',
  textSubdued: '#5A5E6B',
  border: '#23252B',
  inputBorder: '#282A30',
  placeholder: '#636773',
  tabBarBg: '#0E0F12',
  tabBarBorder: '#1D1F24',
  tabInactive: '#5A5E6B',
};

export const TYPE = {
  display: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  body: { fontSize: 11, fontWeight: '400', color: '#8A8F9D' },
  micro: { fontSize: 10, fontWeight: '400', color: '#8A8F9D' },
} satisfies Record<string, TextStyle>;