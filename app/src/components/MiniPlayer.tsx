import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassSurface } from './GlassSurface';
import { Artwork } from './Artwork';
import { Text } from './Text';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { usePlayerStore } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { MiniPlayerHeight, Radius, Spacing } from '@/theme/tokens';

export function MiniPlayer() {
  const router = useRouter();
  const { colors } = useTheme();
  const current = usePlayerStore((s) => s.current());
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMillis = usePlayerStore((s) => s.positionMillis);
  const durationMillis = usePlayerStore((s) => s.durationMillis);
  const server = useServerStore((s) => s.active());

  if (!current) return null;

  const progress =
    durationMillis > 0 ? Math.min(1, Math.max(0, positionMillis / durationMillis)) : 0;
  const artworkUri = ensureAbsoluteUrl(server?.baseUrl, current.album?.artwork_url ?? null);

  return (
    <View style={[styles.wrap, { borderRadius: Radius.lg }]}>
      <GlassSurface style={{ borderRadius: Radius.lg }} />
      <Pressable
        haptic="light"
        onPress={() => router.push('/player')}
        style={styles.pressable}
      >
        <View style={styles.row}>
          <Artwork uri={artworkUri} size={44} radius={Radius.sm} />
          <View style={styles.meta}>
            <Text variant="callout" numberOfLines={1} style={{ fontWeight: '600' }}>
              {current.title}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {current.artist?.name ?? 'Unknown Artist'}
            </Text>
          </View>
          <Pressable
            haptic="light"
            hitSlop={12}
            onPress={() => playerEngine.toggle()}
            style={styles.iconBtn}
          >
            <Icon name={isPlaying ? 'pause.fill' : 'play.fill'} size={22} />
          </Pressable>
          <Pressable
            haptic="light"
            hitSlop={12}
            onPress={() => playerEngine.next()}
            style={styles.iconBtn}
          >
            <Icon name="forward.fill" size={20} />
          </Pressable>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.text, width: `${progress * 100}%` },
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: MiniPlayerHeight,
    overflow: 'hidden',
    marginHorizontal: Spacing.sm,
  },
  pressable: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  meta: { flex: 1, minWidth: 0 },
  iconBtn: { padding: 6 },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    marginTop: 6,
    marginHorizontal: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%' },
});
