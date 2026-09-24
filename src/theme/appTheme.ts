import type { TextStyle } from 'react-native';

export const COLORS = {
  background: '#101313',
  surface: '#171B1B',
  elevated: '#171B1B',
  card: '#171B1B',
  cardPress: '#1F2423',
  pill: '#171B1B',
  accent: '#FFFFFF',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textSubdued: '#8E8E8E',
  border: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 255, 255, 0.08)',
  placeholder: '#8E8E8E',
  tabBarBg: '#171B1B',
  tabBarBorder: 'rgba(255, 255, 255, 0.05)',
  tabInactive: '#5F5F5F',
  searchBg: '#171B1B',
};

export const TYPE = {
  display: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: '#FFFFFF' },
  body: { fontSize: 11, fontWeight: '400', color: '#A0A0A0' },
  micro: { fontSize: 10, fontWeight: '400', color: '#8E8E8E' },
} satisfies Record<string, TextStyle>;