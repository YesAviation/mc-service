import { StyleSheet } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { GlassSurface } from './GlassSurface';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  icon: SymbolViewProps['name'];
  onPress?: () => void;
  size?: number;
  color?: string;
};

/**
 * Standard right-side header button — small circular glass surface with an
 * accent-tinted icon. Use this for any icon-only action in `ScreenHeader`'s
 * `rightSlot` so multiple buttons line up on the same baseline at the same
 * size.
 */
export function HeaderIconButton({ icon, onPress, size = 34, color }: Props) {
  const { colors } = useTheme();
  const radius = size / 2;
  return (
    <Pressable
      haptic="light"
      onPress={onPress}
      hitSlop={8}
      style={[styles.btn, { width: size, height: size, borderRadius: radius }]}
    >
      <GlassSurface style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      <Icon name={icon} size={Math.round(size * 0.52)} color={color ?? colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
