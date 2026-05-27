import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Spacing } from '@/theme/tokens';

type Props = {
  title: string;
  rightSlot?: React.ReactNode;
};

export function ScreenHeader({ title, rightSlot }: Props) {
  return (
    <View style={styles.row}>
      <Text variant="largeTitle" style={{ flex: 1 }}>
        {title}
      </Text>
      {rightSlot}
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
