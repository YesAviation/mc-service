import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { AlbumCard } from '@/components/AlbumCard';
import { TrackRow } from '@/components/TrackRow';
import { HeaderIconButton } from '@/components/HeaderIconButton';
import { ActionSheet, type ActionItem } from '@/components/ActionSheet';
import { catalogApi, playlistsApi, ApiError } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/paginate';
import type { Album, Artist, Playlist } from '@/lib/api/types';
import { cacheAlbums, cacheArtists, getCachedAlbum, getCachedArtist, enrichTracks } from '@/lib/catalog/enrich';
import type { EnrichedTrack } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useLibraryStore } from '@/lib/library/store';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

const TABS = ['Playlists', 'Artists', 'Albums', 'Songs'] as const;
type LibraryTab = (typeof TABS)[number];

type SortKey = 'recent' | 'title' | 'artist' | 'album' | 'name' | 'year';
type SortOption = { key: SortKey; label: string };

const SORT_OPTIONS: Record<LibraryTab, SortOption[]> = {
  Playlists: [
    { key: 'recent', label: 'Recently Added' },
    { key: 'name', label: 'Name' },
  ],
  Artists: [
    { key: 'name', label: 'Name' },
    { key: 'recent', label: 'Recently Added' },
  ],
  Albums: [
    { key: 'recent', label: 'Recently Added' },
    { key: 'title', label: 'Title' },
    { key: 'artist', label: 'Artist' },
    { key: 'year', label: 'Year' },
  ],
  Songs: [
    { key: 'recent', label: 'Recently Added' },
    { key: 'title', label: 'Title' },
    { key: 'artist', label: 'Artist' },
    { key: 'album', label: 'Album' },
  ],
};

const DEFAULT_SORT: Record<LibraryTab, SortKey> = {
  Playlists: 'recent',
  Artists: 'name',
  Albums: 'recent',
  Songs: 'recent',
};

function byCreatedDesc<T extends { created_at?: string }>(a: T, b: T) {
  return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState<LibraryTab>('Songs');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<EnrichedTrack[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<Record<LibraryTab, SortKey>>(DEFAULT_SORT);

  const libraryTracks = useLibraryStore((s) => s.tracks);
  const libraryError = useLibraryStore((s) => s.error);

  async function load() {
    setError(null);
    try {
      // The user's playlists (one of which is "Favorites" — that's the library spine).
      const pl = await playlistsApi
        .list({ page_size: 100 })
        .catch(() => ({ playlists: [] as Playlist[], pagination: null }));
      setPlaylists(pl.playlists);

      // Refresh the library (Favorites playlist + its tracks).
      await useLibraryStore.getState().refresh();

      // Pull catalog for album/artist hydration so the derived tabs render correctly.
      const [allAlbums, allArtists] = await Promise.all([
        fetchAllPages((page, pageSize) => catalogApi.listAlbums({ page, page_size: pageSize }), 'albums'),
        fetchAllPages((page, pageSize) => catalogApi.listArtists({ page, page_size: pageSize }), 'artists'),
      ]);
      cacheAlbums(allAlbums);
      cacheArtists(allArtists);
      setAlbums(allAlbums);
      setArtists(allArtists);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Whenever the library's track list changes, re-derive enriched form for rendering.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enriched = await enrichTracks(libraryTracks);
      if (!cancelled) setTracks(enriched);
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryTracks]);

  const cardSize = useMemo(() => (width - Spacing.lg * 2 - Spacing.md) / 2, [width]);

  const sortedPlaylists = useMemo(() => {
    const arr = [...playlists];
    if (sort.Playlists === 'name') arr.sort((a, b) => a.name.localeCompare(b.name));
    else arr.sort(byCreatedDesc);
    return arr;
  }, [playlists, sort.Playlists]);

  const libraryAlbums = useMemo(() => {
    const ids = new Set(tracks.map((t) => t.album_id).filter(Boolean));
    const list = albums.filter((a) => ids.has(a.id));
    if (sort.Albums === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort.Albums === 'year') list.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort.Albums === 'artist')
      list.sort((a, b) => {
        const an = getCachedArtist(a.artist_id)?.name ?? '';
        const bn = getCachedArtist(b.artist_id)?.name ?? '';
        return an.localeCompare(bn);
      });
    else list.sort(byCreatedDesc);
    return list;
  }, [tracks, albums, sort.Albums]);

  const libraryArtists = useMemo(() => {
    const ids = new Set(tracks.map((t) => t.artist_id).filter(Boolean));
    const list = artists.filter((a) => ids.has(a.id));
    if (sort.Artists === 'recent') list.sort(byCreatedDesc);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [tracks, artists, sort.Artists]);

  const sortedTracks = useMemo(() => {
    const arr = [...tracks];
    if (sort.Songs === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort.Songs === 'artist')
      arr.sort((a, b) => (a.artist?.name ?? '').localeCompare(b.artist?.name ?? ''));
    else if (sort.Songs === 'album')
      arr.sort((a, b) => (a.album?.title ?? '').localeCompare(b.album?.title ?? ''));
    else arr.sort(byCreatedDesc);
    return arr;
  }, [tracks, sort.Songs]);

  const filterItems: ActionItem[] = SORT_OPTIONS[active].map((opt) => ({
    label: opt.label,
    icon: sort[active] === opt.key ? 'checkmark' : undefined,
    onPress: () => setSort((prev) => ({ ...prev, [active]: opt.key })),
  }));

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={colors.text}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
    />
  );

  const displayError = error ?? libraryError;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View>
        <ScreenHeader
          title="Library"
          rightSlot={
            <View style={styles.headerActions}>
              <HeaderIconButton
                icon="line.3.horizontal.decrease"
                onPress={() => setFilterOpen(true)}
              />
              <HeaderIconButton
                icon="magnifyingglass"
                onPress={() => router.push('/search')}
              />
            </View>
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => {
            const isActive = t === active;
            return (
              <Pressable
                key={t}
                haptic="light"
                onPress={() => setActive(t)}
                style={[
                  styles.tab,
                  { backgroundColor: isActive ? colors.accentMuted : colors.surfaceMuted },
                ]}
              >
                <Text
                  variant="footnote"
                  style={{ color: isActive ? colors.accent : colors.text, fontWeight: '600' }}
                >
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : displayError ? (
        <View style={styles.empty}>
          <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {displayError}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {active === 'Playlists' && (
            <FlatList
              data={sortedPlaylists}
              keyExtractor={(p) => p.id}
              contentContainerStyle={listPad}
              refreshControl={refreshControl}
              ItemSeparatorComponent={() => (
                <View style={[styles.sep, { backgroundColor: colors.separator }]} />
              )}
              renderItem={({ item }) => (
                <Pressable
                  haptic="light"
                  onPress={() => router.push(`/playlist/${item.id}`)}
                  style={styles.listRow}
                >
                  <View style={[styles.playlistArt, { backgroundColor: colors.artworkPlaceholder }]}>
                    <Icon name="music.note.list" size={22} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="callout" style={{ fontWeight: '600' }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="footnote" tone="secondary" numberOfLines={1}>
                      {item.tracks.length} song{item.tracks.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Icon name="chevron.right" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={<Empty label="No playlists yet" />}
            />
          )}

          {active === 'Albums' && (
            <FlatList
              data={libraryAlbums}
              numColumns={2}
              keyExtractor={(a) => a.id}
              columnWrapperStyle={{ gap: Spacing.md, paddingHorizontal: Spacing.lg }}
              contentContainerStyle={{ ...listPad, gap: Spacing.lg }}
              refreshControl={refreshControl}
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
                <Empty label="No albums in your library yet" hint="Heart a song to start filling it out." />
              }
            />
          )}

          {active === 'Artists' && (
            <FlatList
              data={libraryArtists}
              keyExtractor={(a) => a.id}
              contentContainerStyle={listPad}
              refreshControl={refreshControl}
              ItemSeparatorComponent={() => (
                <View style={[styles.sep, { backgroundColor: colors.separator }]} />
              )}
              renderItem={({ item }) => (
                <Pressable
                  haptic="light"
                  onPress={() => router.push(`/artist/${item.id}`)}
                  style={styles.listRow}
                >
                  <View style={[styles.artistArt, { backgroundColor: colors.artworkPlaceholder }]}>
                    <Icon name="person.fill" size={22} color={colors.textSecondary} />
                  </View>
                  <Text variant="callout" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Icon name="chevron.right" size={16} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                <Empty label="No artists in your library yet" hint="Heart a song to start filling it out." />
              }
            />
          )}

          {active === 'Songs' && (
            <FlatList
              data={sortedTracks}
              keyExtractor={(t) => t.id}
              contentContainerStyle={listPad}
              refreshControl={refreshControl}
              ItemSeparatorComponent={() => (
                <View style={[styles.sep, { backgroundColor: colors.separator }]} />
              )}
              renderItem={({ item, index }) => (
                <TrackRow
                  track={item}
                  onPress={() => playerEngine.playTracks(sortedTracks, index)}
                />
              )}
              ListEmptyComponent={
                <Empty label="Your library is empty" hint="Heart a song to add it here." />
              }
            />
          )}
        </View>
      )}

      <ActionSheet
        visible={filterOpen}
        title={`Sort ${active} by`}
        items={filterItems}
        onClose={() => setFilterOpen(false)}
      />
    </SafeAreaView>
  );
}

const listPad = { paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg, paddingTop: Spacing.sm };

function Empty({ label, hint }: { label: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: Spacing.xxl, alignItems: 'center' }}>
      <Text variant="callout" tone="secondary">
        {label}
      </Text>
      {hint ? (
        <Text variant="footnote" style={{ color: colors.textTertiary, marginTop: 4, textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tabs: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.sm },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill },
  loading: { paddingVertical: 80, alignItems: 'center' },
  empty: { padding: Spacing.lg },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    minHeight: 64,
  },
  playlistArt: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistArt: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
