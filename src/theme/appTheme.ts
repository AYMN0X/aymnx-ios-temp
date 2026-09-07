import type { TextStyle } from 'react-native';

export const COLORS = {
  background: '#121212',
  elevated: '#242424',
  card: '#282828',
  cardPress: '#3E3E3E',
  pill: '#2A2A2A',
  green: '#1ED760',
  accent: '#781ECF',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textSubdued: '#6A6A6A',
};

export const TYPE = {
  display: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  body: { fontSize: 11, fontWeight: '400', color: '#B3B3B3' },
  micro: { fontSize: 10, fontWeight: '400', color: '#B3B3B3' },
} satisfies Record<string, TextStyle>;