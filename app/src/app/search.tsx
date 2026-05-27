import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { TrackRow } from '@/components/TrackRow';
import { catalogApi } from '@/lib/api';
import type { Album, Artist } from '@/lib/api/types';
import { cacheAlbums, cacheArtists, enrichTracks } from '@/lib/catalog/enrich';
import type { EnrichedTrack } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl } from '@/lib/format';
import { Artwork } from '@/components/Artwork';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const server = useServerStore((s) => s.active());
  const [query, setQuery] = useState('');
  const [allTracks, setAllTracks] = useState<EnrichedTrack[]>([]);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [allArtists, setAllArtists] = useState<Artist[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [tr, al, ar] = await Promise.all([
          catalogApi.listTracks({ page_size: 200 }),
          catalogApi.listAlbums({ page_size: 200 }),
          catalogApi.listArtists({ page_size: 200 }),
        ]);
        cacheAlbums(al.albums);
        cacheArtists(ar.artists);
        setAllAlbums(al.albums);
        setAllArtists(ar.artists);
        setAllTracks(await enrichTracks(tr.tracks));
      } catch {
        // ignore
      }
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const tracks = useMemo(
    () =>
      q
        ? allTracks.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.artist?.name.toLowerCase().includes(q) ||
              t.album?.title.toLowerCase().includes(q),
          )
        : [],
    [q, allTracks],
  );
  const albums = useMemo(
    () => (q ? allAlbums.filter((a) => a.title.toLowerCase().includes(q)) : []),
    [q, allAlbums],
  );
  const artists = useMemo(
    () => (q ? allArtists.filter((a) => a.name.toLowerCase().includes(q)) : []),
    [q, allArtists],
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable haptic="light" onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron.left" size={22} color={colors.accent} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="Search your library"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {!q ? (
          <View style={{ padding: Spacing.xxl, alignItems: 'center' }}>
            <Icon name="magnifyingglass" size={36} color={colors.textTertiary} />
            <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.sm }}>
              Search artists, albums, and songs
            </Text>
          </View>
        ) : (
          <>
            {artists.length > 0 ? (
              <Section title="Artists">
                {artists.slice(0, 5).map((ar) => (
                  <Pressable
                    key={ar.id}
                    haptic="light"
                    onPress={() => router.push(`/artist/${ar.id}`)}
                    style={styles.row}
                  >
                    <Artwork
                      uri={ensureAbsoluteUrl(server?.baseUrl, ar.image_url)}
                      size={44}
                      radius={22}
                    />
                    <Text variant="callout" style={{ flex: 1 }}>
                      {ar.name}
                    </Text>
                    <Icon name="chevron.right" size={14} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </Section>
            ) : null}

            {albums.length > 0 ? (
              <Section title="Albums">
                {albums.slice(0, 5).map((al) => (
                  <Pressable
                    key={al.id}
                    haptic="light"
                    onPress={() => router.push(`/album/${al.id}`)}
                    style={styles.row}
                  >
                    <Artwork
                      uri={ensureAbsoluteUrl(server?.baseUrl, al.artwork_url)}
                      size={44}
                      radius={Radius.sm}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" numberOfLines={1}>
                        {al.title}
                      </Text>
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {al.year ? String(al.year) : al.genre}
                      </Text>
                    </View>
                    <Icon name="chevron.right" size={14} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </Section>
            ) : null}

            {tracks.length > 0 ? (
              <Section title="Songs">
                {tracks.slice(0, 25).map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    onPress={() => playerEngine.playTracks(tracks, i)}
                  />
                ))}
              </Section>
            ) : null}

            {tracks.length === 0 && albums.length === 0 && artists.length === 0 ? (
              <View style={{ padding: Spacing.xxl, alignItems: 'center' }}>
                <Text tone="secondary">No results</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text
        variant="footnote"
        tone="secondary"
        style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 4, textTransform: 'uppercase' }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
