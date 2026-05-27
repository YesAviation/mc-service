import { useColorScheme } from 'react-native';
import { palettes, type Palette, type ThemeMode } from '@/theme/colors';

export function useTheme(): { mode: ThemeMode; colors: Palette } {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'light' ? 'light' : 'dark';
  return { mode, colors: palettes[mode] };
}
