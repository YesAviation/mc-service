import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { TypeScale } from '@/theme/tokens';
import { useTheme } from '@/hooks/useTheme';

type Variant = keyof typeof TypeScale;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent';

type Props = TextProps & {
  variant?: Variant;
  tone?: Tone;
  style?: TextStyle | TextStyle[];
};

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: Props) {
  const { colors } = useTheme();
  const color =
    tone === 'secondary'
      ? colors.textSecondary
      : tone === 'tertiary'
        ? colors.textTertiary
        : tone === 'accent'
          ? colors.accent
          : colors.text;
  return <RNText {...rest} style={[TypeScale[variant], { color }, style]} />;
}
