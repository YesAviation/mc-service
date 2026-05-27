import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type Props = ViewProps & {
  intensity?: number;
  tint?: 'light' | 'dark' | 'systemThinMaterial' | 'systemUltraThinMaterial';
  glassEffectStyle?: 'regular' | 'clear';
};

export function GlassSurface({
  intensity = 60,
  tint,
  glassEffectStyle = 'regular',
  style,
  children,
  ...rest
}: Props) {
  const { mode, colors } = useTheme();

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={[StyleSheet.absoluteFill, style]}
        glassEffectStyle={glassEffectStyle}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (
      <BlurView
        intensity={intensity}
        tint={tint ?? (mode === 'dark' ? 'dark' : 'light')}
        style={[StyleSheet.absoluteFill, style]}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassTint }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
