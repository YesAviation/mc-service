import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Pressable } from '@/components/Pressable';
import { Artwork } from '@/components/Artwork';
import { AlbumCard } from '@/components/AlbumCard';
import { GlassCapsule } from '@/components/GlassCapsule';
import { ActionSheet, type ActionItem } from '@/components/ActionSheet';
import { catalogApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/paginate';
import type { Album, Artist, Track } from '@/lib/api/types';
import { cacheArtists, cacheAlbums, getCachedAlbum, enrichTracks } from '@/lib/catalog/enrich';
import type { EnrichedTrack } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { usePlayerStore } from '@/lib/player/store';
import { useLibraryStore } from '@/lib/library/store';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl, formatDuration } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

const TOP_SONGS_PER_PAGE = 4;
const TOP_SONGS_PAGES = 4;

function isLikelySingleOrEp(album: Album, trackCount: number | undefined): boolean {
  const titleHints = /(single|\bEP\b|\(remix|version)/i;
  if (titleHints.test(album.title)) return true;
  if (trackCount !== undefined && trackCount <= 4) return true;
  return false;
}

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const server = useServerStore((s) => s.active());

  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [allTracks, setAllTracks] = useState<EnrichedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const ar = await catalogApi.getArtist(id);
        cacheArtists([ar]);
        setArtist(ar);

        const albumsRes = await catalogApi.listAlbums({ artist_id: id, page_size: 100 });
        cacheAlbums(albumsRes.albums);
        setAlbums(albumsRes.albums);

        const tracks = await fetchAllPages(
          (page, pageSize) =>
            catalogApi.listTracks({ artist_id: id, page, page_size: pageSize }),
          'tracks',
        );
        const enriched = await enrichTracks(tracks);
        setAllTracks(enriched);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const heroUri = ensureAbsoluteUrl(server?.baseUrl, artist?.image_url ?? null);
  const heroHeight = Math.min(Math.round(width * 1.05), 540);

  const tracksPerAlbum = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of allTracks) {
      map.set(t.album_id, (map.get(t.album_id) ?? 0) + 1);
    }
    return map;
  }, [allTracks]);

  const sortedAlbums = useMemo(
    () => [...albums].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [albums],
  );

  const fullAlbums = useMemo(
    () => sortedAlbums.filter((a) => !isLikelySingleOrEp(a, tracksPerAlbum.get(a.id))),
    [sortedAlbums, tracksPerAlbum],
  );
  const singlesAndEps = useMemo(
    () => sortedAlbums.filter((a) => isLikelySingleOrEp(a, tracksPerAlbum.get(a.id))),
    [sortedAlbums, tracksPerAlbum],
  );

  const latestRelease = sortedAlbums[0];

  // Heuristic "Top Songs" since we have no analytics yet — newest album first,
  // then by track number. Replace with real listen counts when analytics ship.
  const topTracks = useMemo(() => {
    const albumOrder = new Map<string, number>();
    sortedAlbums.forEach((a, i) => albumOrder.set(a.id, i));
    return [...allTracks]
      .sort((a, b) => {
        const ai = albumOrder.get(a.album_id) ?? 9999;
        const bi = albumOrder.get(b.album_id) ?? 9999;
        if (ai !== bi) return ai - bi;
        return (a.track_number || 0) - (b.track_number || 0);
      })
      .slice(0, TOP_SONGS_PER_PAGE * TOP_SONGS_PAGES);
  }, [allTracks, sortedAlbums]);

  const dominantGenre = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of albums) {
      if (!a.genre) continue;
      counts.set(a.genre, (counts.get(a.genre) ?? 0) + 1);
    }
    let bestName: string | null = null;
    let bestCount = 0;
    counts.forEach((n, name) => {
      if (n > bestCount) {
        bestName = name;
        bestCount = n;
      }
    });
    return bestName;
  }, [albums]);

  const playAll = () => {
    if (allTracks.length) playerEngine.playTracks(allTracks, 0);
  };
  const shuffleAll = () => {
    if (!allTracks.length) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    if (!usePlayerStore.getState().shuffle) usePlayerStore.getState().toggleShuffle();
    playerEngine.playTracks(shuffled, 0);
  };

  const menuItems: ActionItem[] = [
    { label: 'Shuffle', icon: 'shuffle', onPress: shuffleAll },
    {
      label: 'Share',
      icon: 'square.and.arrow.up',
      onPress: () => Alert.alert('Coming soon', 'Sharing not implemented yet.'),
    },
  ];

  if (loading) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!artist) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]}>
        <Text variant="callout" tone="secondary">
          Artist not found
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.artworkPlaceholder }]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBottom}>
            <Text
              numberOfLines={2}
              style={{
                color: '#FFFFFF',
                fontSize: 36,
                fontWeight: '800',
                letterSpacing: -0.5,
              }}
            >
              {artist.name}
            </Text>
          </View>
          <Pressable
            haptic="medium"
            onPress={playAll}
            style={[styles.playFab, { backgroundColor: colors.accent }]}
          >
            <View style={{ marginLeft: 3 }}>
              <Icon name="play.fill" size={26} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>

        <View style={{ height: 28 }} />

        {latestRelease ? (
          <View style={styles.latestRow}>
            <Pressable
              haptic="light"
              onPress={() => router.push(`/album/${latestRelease.id}`)}
              style={{ borderRadius: Radius.md, overflow: 'hidden' }}
            >
              <Artwork
                uri={ensureAbsoluteUrl(server?.baseUrl, latestRelease.artwork_url)}
                size={130}
                radius={Radius.md}
              />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="caption" tone="secondary" style={{ letterSpacing: 0.5 }}>
                LATEST RELEASE
              </Text>
              <Text variant="headline" numberOfLines={2} style={{ fontWeight: '700' }}>
                {latestRelease.title}
              </Text>
              <Text variant="footnote" tone="secondary">
                {tracksPerAlbum.get(latestRelease.id) ?? 0} song
                {(tracksPerAlbum.get(latestRelease.id) ?? 0) === 1 ? '' : 's'}
                {latestRelease.year ? ` · ${latestRelease.year}` : ''}
              </Text>
              <View style={{ marginTop: Spacing.sm }}>
                <Pressable
                  haptic="light"
                  onPress={() => router.push(`/album/${latestRelease.id}`)}
                  hitSlop={10}
                  style={[styles.plusBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Icon name="plus" size={20} color={colors.accent} />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {topTracks.length > 0 ? (
          <>
            <SectionHead
              title="Top Songs"
              chevron
              onPress={() =>
                playerEngine.playTracks(topTracks.concat(
                  allTracks.filter((t) => !topTracks.find((x) => x.id === t.id)),
                ), 0)
              }
            />
            <TopSongsPager
              tracks={topTracks}
              pageWidth={width}
              onPlay={(idx) => playerEngine.playTracks(topTracks, idx)}
              baseUrl={server?.baseUrl}
            />
          </>
        ) : null}

        {fullAlbums.length > 0 ? (
          <>
            <SectionHead title="Albums" />
            <AlbumCarousel
              data={fullAlbums}
              onPress={(a) => router.push(`/album/${a.id}`)}
              cardSize={(width - Spacing.lg * 2 - Spacing.md) / 2.2}
              baseUrl={server?.baseUrl}
            />
          </>
        ) : null}

        {singlesAndEps.length > 0 ? (
          <>
            <SectionHead title="Singles & EPs" chevron />
            <AlbumCarousel
              data={singlesAndEps}
              onPress={(a) => router.push(`/album/${a.id}`)}
              cardSize={(width - Spacing.lg * 2 - Spacing.md) / 2.2}
              baseUrl={server?.baseUrl}
            />
          </>
        ) : null}

        {(artist.bio || dominantGenre) ? (
          <View style={[styles.aboutBlock, { backgroundColor: colors.surfaceMuted }]}>
            <Text
              style={{
                color: colors.text,
                fontSize: 22,
                fontWeight: '700',
                marginBottom: Spacing.md,
              }}
            >
              About {artist.name}
            </Text>

            {artist.bio ? (
              <>
                <Text
                  variant="body"
                  numberOfLines={bioExpanded ? undefined : 4}
                  style={{ color: colors.text, lineHeight: 22 }}
                >
                  {artist.bio}
                </Text>
                {!bioExpanded && artist.bio.length > 220 ? (
                  <Pressable haptic="light" onPress={() => setBioExpanded(true)} hitSlop={6}>
                    <Text variant="footnote" tone="accent" style={{ marginTop: 6, fontWeight: '600' }}>
                      MORE
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {dominantGenre ? (
              <View style={{ marginTop: Spacing.lg, gap: 4 }}>
                <Text variant="caption" tone="secondary" style={{ letterSpacing: 0.5 }}>
                  GENRE
                </Text>
                <Text variant="body" style={{ color: colors.text }}>
                  {dominantGenre}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[styles.floatingNav, { paddingTop: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <GlassCapsule height={38} paddingHorizontal={12}>
          <Pressable haptic="light" onPress={() => router.back()} hitSlop={8}>
            <Icon name="chevron.left" size={20} color="#FFFFFF" />
          </Pressable>
        </GlassCapsule>
        <View style={{ flex: 1 }} />
        <GlassCapsule height={38} paddingHorizontal={14}>
          <Pressable
            haptic="light"
            onPress={() => Alert.alert('Coming soon', 'Following an artist not built yet.')}
            hitSlop={8}
          >
            <Icon name="star" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable haptic="light" onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Icon name="ellipsis" size={18} color="#FFFFFF" />
          </Pressable>
        </GlassCapsule>
      </View>

      <ActionSheet
        visible={menuOpen}
        title={artist.name}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

function SectionHead({
  title,
  chevron,
  onPress,
}: {
  title: string;
  chevron?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{title}</Text>
      {chevron ? <Icon name="chevron.right" size={16} color={colors.textSecondary} /> : null}
    </View>
  );
  return (
    <View style={styles.sectionHead}>
      {chevron && onPress ? (
        <Pressable haptic="light" onPress={onPress} hitSlop={6}>
          {inner}
        </Pressable>
      ) : (
        inner
      )}
    </View>
  );
}

function AlbumCarousel({
  data,
  onPress,
  cardSize,
  baseUrl,
}: {
  data: Album[];
  onPress: (a: Album) => void;
  cardSize: number;
  baseUrl?: string;
}) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(a) => a.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
      ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
      renderItem={({ item }) => (
        <AlbumCard
          size={cardSize}
          title={item.title}
          subtitle={item.year ? String(item.year) : item.genre}
          artworkPath={item.artwork_url}
          onPress={() => onPress(item)}
        />
      )}
    />
  );
}

function TopSongsPager({
  tracks,
  pageWidth,
  onPlay,
  baseUrl,
}: {
  tracks: EnrichedTrack[];
  pageWidth: number;
  onPlay: (idx: number) => void;
  baseUrl?: string;
}) {
  const pages: EnrichedTrack[][] = [];
  for (let i = 0; i < tracks.length; i += TOP_SONGS_PER_PAGE) {
    pages.push(tracks.slice(i, i + TOP_SONGS_PER_PAGE));
  }
  return (
    <FlatList
      horizontal
      data={pages}
      keyExtractor={(_, i) => `page-${i}`}
      showsHorizontalScrollIndicator={false}
      pagingEnabled
      decelerationRate="fast"
      snapToInterval={pageWidth}
      renderItem={({ item: page, index: pageIndex }) => (
        <View style={{ width: pageWidth, paddingHorizontal: Spacing.lg }}>
          {page.map((t, i) => (
            <TopSongRow
              key={t.id}
              track={t}
              baseUrl={baseUrl}
              onPress={() => onPlay(pageIndex * TOP_SONGS_PER_PAGE + i)}
            />
          ))}
        </View>
      )}
    />
  );
}

function TopSongRow({
  track,
  baseUrl,
  onPress,
}: {
  track: EnrichedTrack;
  baseUrl?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const isFavorite = useLibraryStore((s) => s.ids.has(track.id));
  const albumTitle = track.album?.title ?? '';
  const year = track.year ? ` · ${track.year}` : '';
  const artUri = ensureAbsoluteUrl(baseUrl, track.album?.artwork_url ?? null);
  return (
    <Pressable haptic={false} onPress={onPress} style={styles.topRow}>
      <View style={styles.topStarCol}>
        {isFavorite ? (
          <Icon name="star.fill" size={11} color={colors.accent} />
        ) : null}
      </View>
      <Artwork uri={artUri} size={48} radius={Radius.sm} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="body" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {albumTitle}
          {year}
        </Text>
      </View>
      <Pressable
        haptic="light"
        onPress={() => Alert.alert('Coming soon', 'Track menu not yet wired here.')}
        hitSlop={10}
      >
        <Icon name="ellipsis" size={16} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', overflow: 'visible' },
  heroBottom: {
    position: 'absolute',
    left: Spacing.lg,
    right: 100,
    bottom: Spacing.lg,
  },
  playFab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: -28,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  floatingNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  latestRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    minHeight: 64,
  },
  topStarCol: { width: 14, alignItems: 'center' },
  aboutBlock: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xxxl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
});
