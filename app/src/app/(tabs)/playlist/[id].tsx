import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Artwork } from '@/components/Artwork';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TrackRow } from '@/components/TrackRow';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { playlistsApi, catalogApi, ApiError } from '@/lib/api';
import type { Playlist, Track } from '@/lib/api/types';
import { enrichTracks } from '@/lib/catalog/enrich';
import type { EnrichedTrack } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<EnrichedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await playlistsApi.get(id);
        setPlaylist(p);
        const fetched = await Promise.all(
          p.tracks.map((pt) => catalogApi.getTrack(pt.track_id).catch(() => null)),
        );
        const valid = fetched.filter((t): t is Track => Boolean(t));
        const enriched = await enrichTracks(valid);
        setTracks(enriched);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load playlist');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable haptic="light" onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron.left" size={22} color={colors.accent} />
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
        ) : playlist ? (
          <>
            <View style={styles.heroWrap}>
              <Artwork uri={null} size={220} radius={Radius.lg} />
              <Text variant="title2" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
                {playlist.name}
              </Text>
              {playlist.description ? (
                <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                  {playlist.description}
                </Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <Button
                title="Play"
                onPress={() => tracks.length && playerEngine.playTracks(tracks, 0)}
                style={{ flex: 1 }}
              />
              <Button
                title="Shuffle"
                variant="secondary"
                onPress={() => {
                  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                  if (shuffled.length) playerEngine.playTracks(shuffled, 0);
                }}
                style={{ flex: 1 }}
              />
            </View>

            {tracks.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                track={t}
                onPress={() => playerEngine.playTracks(tracks, i)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  loading: { paddingVertical: 80, alignItems: 'center' },
  heroWrap: { alignItems: 'center', padding: Spacing.lg, gap: 4 },
  actions: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
});
