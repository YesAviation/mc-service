import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Artwork } from '@/components/Artwork';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TrackRow } from '@/components/TrackRow';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { catalogApi, ApiError } from '@/lib/api';
import type { Album, Artist } from '@/lib/api/types';
import { cacheAlbums, cacheArtists, enrichTracks } from '@/lib/catalog/enrich';
import type { EnrichedTrack } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl, formatDuration } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const server = useServerStore((s) => s.active());
  const [album, setAlbum] = useState<Album | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<EnrichedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const a = await catalogApi.getAlbum(id);
        cacheAlbums([a]);
        setAlbum(a);
        const [trRes, ar] = await Promise.all([
          catalogApi.listTracks({ album_id: id, page_size: 100 }),
          a.artist_id ? catalogApi.getArtist(a.artist_id).catch(() => null) : null,
        ]);
        if (ar) {
          cacheArtists([ar]);
          setArtist(ar);
        }
        const enriched = await enrichTracks(trRes.tracks);
        const sorted = enriched.sort(
          (x, y) => x.disc_number - y.disc_number || x.track_number - y.track_number,
        );
        setTracks(sorted);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load album');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const artUri = ensureAbsoluteUrl(server?.baseUrl, album?.artwork_url ?? null);
  const artSize = Math.min(width - Spacing.lg * 2, 280);
  const totalSecs = tracks.reduce((s, t) => s + (t.duration_secs || 0), 0);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable haptic="light" onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron.left" size={22} color={colors.accent} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable haptic="light" hitSlop={12}>
          <Icon name="ellipsis" size={20} color={colors.accent} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg }}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : error ? (
          <View style={{ padding: Spacing.lg }}>
            <Text tone="secondary">{error}</Text>
          </View>
        ) : album ? (
          <>
            <View style={styles.heroWrap}>
              <Artwork uri={artUri} size={artSize} radius={Radius.lg} />
              <Text variant="title2" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
                {album.title}
              </Text>
              <Pressable haptic="light" onPress={() => artist && router.push(`/artist/${artist.id}`)}>
                <Text variant="callout" tone="accent">
                  {artist?.name ?? '—'}
                </Text>
              </Pressable>
              <Text variant="footnote" tone="secondary">
                {album.genre}{album.year ? ` • ${album.year}` : ''}
              </Text>
            </View>

            <View style={styles.actions}>
              <Button
                title="Play"
                onPress={() => playerEngine.playTracks(tracks, 0)}
                style={{ flex: 1 }}
              />
              <Button
                title="Shuffle"
                variant="secondary"
                onPress={() => {
                  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                  playerEngine.playTracks(shuffled, 0);
                }}
                style={{ flex: 1 }}
              />
            </View>

            {tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i}
                showArtwork={false}
                showArtist={false}
                onPress={() => playerEngine.playTracks(tracks, i)}
              />
            ))}

            <Text
              variant="footnote"
              tone="secondary"
              style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}
            >
              {tracks.length} song{tracks.length === 1 ? '' : 's'} • {formatDuration(totalSecs)}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  loading: { paddingVertical: 80, alignItems: 'center' },
  heroWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
});
