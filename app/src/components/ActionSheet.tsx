import { Modal, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './GlassSurface';
import { Text } from './Text';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing } from '@/theme/tokens';
import type { SymbolViewProps } from 'expo-symbols';

export type ActionItem = {
  label: string;
  icon?: SymbolViewProps['name'];
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  items: ActionItem[];
  onClose: () => void;
};

export function ActionSheet({ visible, title, items, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <RNPressable style={styles.scrim} onPress={onClose}>
        <View style={{ flex: 1 }} />
      </RNPressable>
      <View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, Spacing.md) },
        ]}
      >
        <View style={[styles.surface, { borderRadius: Radius.lg }]}>
          <GlassSurface style={{ borderRadius: Radius.lg }} />
          <View style={{ padding: Spacing.sm }}>
            {title ? (
              <Text
                variant="footnote"
                tone="secondary"
                style={{ paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md }}
              >
                {title}
              </Text>
            ) : null}
            {items.map((item, i) => (
              <Pressable
                key={`${item.label}-${i}`}
                haptic="light"
                onPress={() => {
                  onClose();
                  setTimeout(() => item.onPress(), 60);
                }}
                style={[
                  styles.row,
                  i < items.length - 1
                    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }
                    : null,
                ]}
              >
                {item.icon ? (
                  <Icon
                    name={item.icon}
                    size={20}
                    color={item.destructive ? colors.destructive : colors.text}
                  />
                ) : null}
                <Text
                  variant="body"
                  style={{
                    color: item.destructive ? colors.destructive : colors.text,
                    flex: 1,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          haptic="light"
          onPress={onClose}
          style={[styles.cancel, { borderRadius: Radius.lg, marginTop: Spacing.sm }]}
        >
          <GlassSurface style={{ borderRadius: Radius.lg }} />
          <Text variant="headline" tone="accent" style={{ textAlign: 'center', padding: Spacing.md }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: 0,
  },
  surface: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  cancel: { overflow: 'hidden' },
});
