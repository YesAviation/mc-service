import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/useTheme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const { colors } = useTheme();

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: colors.accent, fg: '#FFFFFF' };
      case 'destructive':
        return { bg: colors.destructive, fg: '#FFFFFF' };
      case 'secondary':
        return { bg: colors.surfaceMuted, fg: colors.text };
      case 'ghost':
        return { bg: 'transparent', fg: colors.accent };
    }
  })();

  return (
    <Pressable
      haptic={variant === 'primary' || variant === 'destructive' ? 'medium' : 'light'}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          <Text variant="headline" style={{ color: palette.fg, textAlign: 'center' }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
});
