import { Pressable as RNPressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = PressableProps & {
  haptic?: 'light' | 'medium' | 'heavy' | false;
};

export function Pressable({ haptic = 'light', onPress, children, style, ...rest }: Props) {
  return (
    <RNPressable
      {...rest}
      onPress={(e) => {
        if (haptic) {
          const map = {
            light: Haptics.ImpactFeedbackStyle.Light,
            medium: Haptics.ImpactFeedbackStyle.Medium,
            heavy: Haptics.ImpactFeedbackStyle.Heavy,
          } as const;
          Haptics.impactAsync(map[haptic]).catch(() => {});
        }
        onPress?.(e);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed ? { opacity: 0.6 } : null,
      ]}
    >
      {typeof children === 'function' ? children : children}
    </RNPressable>
  );
}
