import type { TextStyle } from 'react-native';

export const COLORS = {
  background: '#111216',
  surface: '#191A20',
  elevated: '#191A20',
  card: '#232428',
  cardPress: '#2A2D33',
  pill: '#191A20',
  green: '#1ED760',
  accent: '#E94B35',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#949BA4',
  textSubdued: '#6A7079',
  border: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 255, 255, 0.08)',
  placeholder: '#949BA4',
  tabBarBg: '#111216',
  tabBarBorder: 'rgba(255, 255, 255, 0.06)',
  tabInactive: '#949BA4',
  searchBg: '#1E1F22',
};

export const TYPE = {
  display: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: '#FFFFFF' },
  body: { fontSize: 11, fontWeight: '400', color: '#949BA4' },
  micro: { fontSize: 10, fontWeight: '400', color: '#949BA4' },
} satisfies Record<string, TextStyle>;