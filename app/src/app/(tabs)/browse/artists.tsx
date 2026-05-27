import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { Artwork } from '@/components/Artwork';
import { catalogApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/paginate';
import type { Artist } from '@/lib/api/types';
import { cacheArtists } from '@/lib/catalog/enrich';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, MiniPlayerHeight, TabBarHeight } from '@/theme/tokens';

export default function BrowseArtistsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const server = useServerStore((s) => s.active());
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await fetchAllPages(
          (page, pageSize) => catalogApi.listArtists({ page, page_size: pageSize }),
          'artists',
        );
        cacheArtists(all);
        setArtists(all);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(
    () => [...artists].sort((a, b) => a.name.localeCompare(b.name)),
    [artists],
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable haptic="light" onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron.left" size={22} color={colors.accent} />
        </Pressable>
        <Text variant="title3" style={{ flex: 1 }}>
          Artists
        </Text>
        <Text variant="footnote" tone="secondary">
          {artists.length}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{
            paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg,
          }}
          renderItem={({ item }) => (
            <Pressable
              haptic="light"
              onPress={() => router.push(`/artist/${item.id}`)}
              style={styles.row}
            >
              <Artwork
                uri={ensureAbsoluteUrl(server?.baseUrl, item.image_url)}
                size={48}
                radius={24}
              />
              <Text variant="callout" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Icon name="chevron.right" size={14} color={colors.textTertiary} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 76 }} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  loading: { paddingVertical: 80, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
