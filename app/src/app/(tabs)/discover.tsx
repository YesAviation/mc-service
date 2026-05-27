import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { AlbumCard } from '@/components/AlbumCard';
import { TrackRow } from '@/components/TrackRow';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { HeaderIconButton } from '@/components/HeaderIconButton';
import { catalogApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/paginate';
import type { Album, Artist } from '@/lib/api/types';
import { cacheAlbums, cacheArtists, enrichTracks } from '@/lib/catalog/enrich';
import { playerEngine } from '@/lib/player/engine';
import { useTheme } from '@/hooks/useTheme';
import { MiniPlayerHeight, Spacing, TabBarHeight } from '@/theme/tokens';

function sortByCreatedDesc<T extends { created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [recentTracks, setRecentTracks] = useState<Awaited<ReturnType<typeof enrichTracks>>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [allAlbums, allArtists, recentTracksRes] = await Promise.all([
        fetchAllPages((page, pageSize) => catalogApi.listAlbums({ page, page_size: pageSize }), 'albums'),
        fetchAllPages((page, pageSize) => catalogApi.listArtists({ page, page_size: pageSize }), 'artists'),
        catalogApi.listTracks({ page: 1, page_size: 25 }),
      ]);
      cacheAlbums(allAlbums);
      cacheArtists(allArtists);
      setAlbums(sortByCreatedDesc(allAlbums));
      setArtists(allArtists);
      const enriched = await enrichTracks(recentTracksRes.tracks);
      setRecentTracks(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onPlayTrack(t: (typeof recentTracks)[number]) {
    const idx = recentTracks.findIndex((x) => x.id === t.id);
    await playerEngine.playTracks(recentTracks, Math.max(0, idx));
  }

  const cardSize = (width - Spacing.lg * 2 - Spacing.md) / 2.2;
  const artistSize = (width - Spacing.lg * 2 - Spacing.md) / 3.1;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.text}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <ScreenHeader
          title="Discover"
          rightSlot={
            <HeaderIconButton
              icon="magnifyingglass"
              onPress={() => router.push('/search')}
            />
          }
        />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              {error}
            </Text>
          </View>
        ) : (
          <>
            <SectionHeader
              subtitle="Recently Added"
              title="New on Your Server"
              onPressMore={albums.length > 0 ? () => router.push('/browse/albums') : undefined}
            />
            <FlatList
              horizontal
              data={albums.slice(0, 30)}
              keyExtractor={(a) => a.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              renderItem={({ item }) => (
                <AlbumCard
                  size={cardSize}
                  title={item.title}
                  subtitle={item.year ? String(item.year) : item.genre}
                  artworkPath={item.artwork_url}
                  onPress={() => router.push(`/album/${item.id}`)}
                />
              )}
              ListEmptyComponent={
                <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: Spacing.lg }}>
                  No albums yet
                </Text>
              }
            />

            <SectionHeader
              subtitle="Browse"
              title={`Artists${artists.length ? ` · ${artists.length}` : ''}`}
              onPressMore={artists.length > 0 ? () => router.push('/browse/artists') : undefined}
            />
            <FlatList
              horizontal
              data={artists.slice(0, 30)}
              keyExtractor={(a) => a.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              renderItem={({ item }) => (
                <AlbumCard
                  size={artistSize}
                  title={item.name}
                  artworkPath={item.image_url}
                  onPress={() => router.push(`/artist/${item.id}`)}
                />
              )}
              ListEmptyComponent={
                <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: Spacing.lg }}>
                  No artists yet
                </Text>
              }
            />

            <SectionHeader
              subtitle="All Albums"
              title={`Albums${albums.length ? ` · ${albums.length}` : ''}`}
              onPressMore={albums.length > 0 ? () => router.push('/browse/albums') : undefined}
            />
            <FlatList
              horizontal
              data={albums}
              keyExtractor={(a) => `all-${a.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              renderItem={({ item }) => (
                <AlbumCard
                  size={cardSize}
                  title={item.title}
                  subtitle={item.year ? String(item.year) : item.genre}
                  artworkPath={item.artwork_url}
                  onPress={() => router.push(`/album/${item.id}`)}
                />
              )}
            />

            <SectionHeader title="Recently Played" />
            {recentTracks.length === 0 ? (
              <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: Spacing.lg }}>
                Nothing here yet
              </Text>
            ) : (
              recentTracks.slice(0, 6).map((t) => (
                <TrackRow key={t.id} track={t} onPress={() => onPlayTrack(t)} />
              ))
            )}

            <SectionHeader subtitle="Top Picks" title="Made for You" />
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Personalized picks unlock once your listening history is established.
              </Text>
            </View>

            <SectionHeader subtitle="Stations" title="Radio Stations for You" />
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                ML-generated stations arrive with the recommendation service.
              </Text>
            </View>

            <SectionHeader subtitle="Replay" title="Your Year in Music" />
            <View style={[styles.placeholder, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Listening recaps will populate as you play.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hList: { paddingHorizontal: Spacing.lg },
  loading: { paddingVertical: 80, alignItems: 'center' },
  empty: { padding: Spacing.lg },
  placeholder: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: 14,
  },
});
