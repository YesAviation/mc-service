import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { Artwork } from '@/components/Artwork';
import { catalogApi } from '@/lib/api';
import { enrichTracks } from '@/lib/catalog/enrich';
import { playerEngine } from '@/lib/player/engine';
import type { EnrichedTrack } from '@/lib/player/store';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';

const STATIC_GENRES = ['Pop', 'Rock', 'Hip Hop', 'KPOP', 'Jazz', 'Electronic', 'Classical'];

export default function RadioScreen() {
  const { colors } = useTheme();
  const [tracks, setTracks] = useState<EnrichedTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await catalogApi.listTracks({ page: 1, page_size: 80 });
        const enriched = await enrichTracks(res.tracks);
        setTracks(enriched);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function startMainStation() {
    if (!tracks.length) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playerEngine.playTracks(shuffled, 0);
  }

  function startGenreStation(genre: string) {
    const filtered = tracks.filter(
      (t) => t.genre?.toLowerCase().includes(genre.toLowerCase()),
    );
    const pool = filtered.length ? filtered : tracks;
    if (!pool.length) return;
    playerEngine.playTracks([...pool].sort(() => Math.random() - 0.5), 0);
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg }}
      >
        <ScreenHeader title="Radio" />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <>
            <View style={[styles.hero, { backgroundColor: colors.accentMuted }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="footnote" tone="accent" style={{ fontWeight: '700' }}>
                  LIVE STATION
                </Text>
                <Text variant="title2">All Library Radio</Text>
                <Text variant="footnote" tone="secondary">
                  Streams everything on your server, shuffled
                </Text>
              </View>
              <Pressable haptic="medium" onPress={startMainStation} style={styles.playBtn}>
                <Icon name="play.fill" size={26} color={colors.accent} />
              </Pressable>
            </View>

            <SectionHeader subtitle="Stations" title="By Genre" />
            <View style={styles.grid}>
              {STATIC_GENRES.map((g) => (
                <Pressable
                  key={g}
                  haptic="light"
                  onPress={() => startGenreStation(g)}
                  style={[styles.genreCard, { backgroundColor: colors.surface }]}
                >
                  <Artwork uri={null} size={56} radius={Radius.sm} />
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" style={{ fontWeight: '600' }}>
                      {g}
                    </Text>
                    <Text variant="caption" tone="secondary">
                      Station
                    </Text>
                  </View>
                  <Icon name="play.fill" size={18} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>

            <SectionHeader subtitle="Coming Soon" title="ML-Curated Channels" />
            <View
              style={[
                styles.placeholder,
                { backgroundColor: colors.surfaceMuted, marginHorizontal: Spacing.lg },
              ]}
            >
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Personalized stations will appear once recommendations are wired up.
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
  loading: { paddingVertical: 80, alignItems: 'center' },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  grid: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  genreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  placeholder: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
});
