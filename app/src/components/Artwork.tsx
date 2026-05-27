import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Radius } from '@/theme/tokens';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  uri?: string | null;
  size: number;
  radius?: number;
  style?: ViewStyle;
};

export function Artwork({ uri, size, radius = Radius.md, style }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.artworkPlaceholder },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
