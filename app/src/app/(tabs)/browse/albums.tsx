import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlbumCard } from '@/components/AlbumCard';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { catalogApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/paginate';
import type { Album } from '@/lib/api/types';
import { cacheAlbums } from '@/lib/catalog/enrich';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, MiniPlayerHeight, TabBarHeight } from '@/theme/tokens';

export default function BrowseAlbumsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await fetchAllPages(
          (page, pageSize) => catalogApi.listAlbums({ page, page_size: pageSize }),
          'albums',
        );
        cacheAlbums(all);
        setAlbums(all);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cardSize = (width - Spacing.lg * 2 - Spacing.md) / 2;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable haptic="light" onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron.left" size={22} color={colors.accent} />
        </Pressable>
        <Text variant="title3" style={{ flex: 1 }}>
          Albums
        </Text>
        <Text variant="footnote" tone="secondary">
          {albums.length}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={albums}
          numColumns={2}
          keyExtractor={(a) => a.id}
          columnWrapperStyle={{ gap: Spacing.md, paddingHorizontal: Spacing.lg }}
          contentContainerStyle={{
            gap: Spacing.lg,
            paddingTop: Spacing.sm,
            paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg,
          }}
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
});
