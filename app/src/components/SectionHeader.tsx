import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  title: string;
  onPressMore?: () => void;
  subtitle?: string;
};

export function SectionHeader({ title, subtitle, onPressMore }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text variant="footnote" tone="accent" style={{ fontWeight: '600' }}>
            {subtitle.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="title2" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {onPressMore ? (
        <Pressable haptic="light" onPress={onPressMore} hitSlop={8}>
          <Icon name="chevron.right" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
});
