import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { SymbolViewProps } from 'expo-symbols';
import { Icon } from './Icon';
import { Pressable } from './Pressable';

type Props = {
  icon: SymbolViewProps['name'];
  size?: number;
  iconSize?: number;
  iconColor?: string;
  background?: string;
  active?: boolean;
  activeBackground?: string;
  activeIconColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export function CircleButton({
  icon,
  size = 40,
  iconSize,
  iconColor = 'rgba(255,255,255,0.95)',
  background = 'rgba(255,255,255,0.18)',
  active,
  activeBackground = 'rgba(255,255,255,0.28)',
  activeIconColor = '#FFFFFF',
  onPress,
  style,
}: Props) {
  const bg = active ? activeBackground : background;
  const fg = active ? activeIconColor : iconColor;
  const i = iconSize ?? Math.round(size * 0.5);

  return (
    <Pressable
      haptic="light"
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.btn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      <View>
        <Icon name={icon} size={i} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
