export type ThemeMode = 'light' | 'dark';

const dark = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  surfaceMuted: 'rgba(255,255,255,0.06)',
  separator: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.6)',
  textTertiary: 'rgba(235,235,245,0.3)',
  accent: '#FA243C',
  accentMuted: 'rgba(250,36,60,0.18)',
  tabBarTint: 'rgba(20,20,22,0.72)',
  glassTint: 'rgba(28,28,30,0.55)',
  artworkPlaceholder: '#3A3A3C',
  destructive: '#FF453A',
  success: '#30D158',
};

const light = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: 'rgba(0,0,0,0.04)',
  separator: 'rgba(60,60,67,0.18)',
  text: '#000000',
  textSecondary: 'rgba(60,60,67,0.6)',
  textTertiary: 'rgba(60,60,67,0.3)',
  accent: '#FA243C',
  accentMuted: 'rgba(250,36,60,0.12)',
  tabBarTint: 'rgba(255,255,255,0.72)',
  glassTint: 'rgba(255,255,255,0.55)',
  artworkPlaceholder: '#D1D1D6',
  destructive: '#FF3B30',
  success: '#34C759',
};

export const palettes = { light, dark };
export type Palette = typeof dark;
