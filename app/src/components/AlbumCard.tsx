import { StyleSheet, View } from 'react-native';
import { Artwork } from './Artwork';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl } from '@/lib/format';
import { Radius, Spacing } from '@/theme/tokens';

type Props = {
  size: number;
  title: string;
  subtitle?: string;
  artworkPath?: string | null;
  onPress?: () => void;
};

export function AlbumCard({ size, title, subtitle, artworkPath, onPress }: Props) {
  const server = useServerStore((s) => s.active());
  const uri = ensureAbsoluteUrl(server?.baseUrl, artworkPath ?? null);

  return (
    <Pressable haptic="light" onPress={onPress} style={[styles.wrap, { width: size }]}>
      <Artwork uri={uri} size={size} radius={Radius.md} />
      <View style={styles.meta}>
        <Text variant="footnote" numberOfLines={1} style={{ fontWeight: '600' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  meta: { gap: 2 },
});
