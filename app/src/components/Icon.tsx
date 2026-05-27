import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  name: SymbolViewProps['name'];
  fallback?: string;
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
  style?: ViewStyle;
};

export function Icon({ name, size = 22, color, weight = 'regular', style }: Props) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={tint}
        weight={weight}
        style={[{ width: size, height: size }, style]}
      />
    );
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint,
          opacity: 0.9,
        },
        style,
      ]}
    />
  );
}
