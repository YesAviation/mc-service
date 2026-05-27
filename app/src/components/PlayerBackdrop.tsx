import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type Props = { uri: string | null };

/**
 * Player background — heavily blurred album art with a soft tinted scrim that
 * lets the dominant color of the artwork bleed through, rather than crushing
 * everything to dark like a full-opacity scrim would.
 */
export function PlayerBackdrop({ uri }: Props) {
  const { colors } = useTheme();

  if (!uri) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={Platform.OS === 'android' ? 60 : 0}
        cachePolicy="memory-disk"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
    </View>
  );
}
