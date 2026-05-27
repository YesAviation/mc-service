import { useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SymbolViewProps } from 'expo-symbols';
import { Artwork } from './Artwork';
import { Text } from './Text';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl, formatDuration } from '@/lib/format';
import type { EnrichedTrack } from '@/lib/player/store';
import { usePlayerStore } from '@/lib/player/store';
import { useSettingsStore, type SwipeAction, SWIPE_ACTION_COLORS, SWIPE_ACTION_ICONS, SWIPE_ACTION_LABELS } from '@/lib/settings/store';
import { useLibraryStore } from '@/lib/library/store';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  track: EnrichedTrack;
  index?: number;
  showArtwork?: boolean;
  showDuration?: boolean;
  showArtist?: boolean;
  swipeable?: boolean;
  onPress?: () => void;
  onMore?: () => void;
};

export function TrackRow({
  track,
  index,
  showArtwork = true,
  showDuration = true,
  showArtist = true,
  swipeable = true,
  onPress,
  onMore,
}: Props) {
  const { colors } = useTheme();
  const server = useServerStore((s) => s.active());
  const leftAction = useSettingsStore((s) => s.leftSwipeAction);
  const rightAction = useSettingsStore((s) => s.rightSwipeAction);
  const isFavorite = useLibraryStore((s) => s.ids.has(track.id));
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const artUri = ensureAbsoluteUrl(server?.baseUrl, track.album?.artwork_url ?? null);

  function runAction(action: SwipeAction) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    swipeRef.current?.close();
    switch (action) {
      case 'favorite':
        useLibraryStore.getState().toggle(track.id).catch((err) => {
          Alert.alert('Could not update library', err?.message ?? 'Unknown error');
        });
        break;
      case 'queue-next':
        usePlayerStore.getState().enqueueNext(track);
        break;
      case 'queue-end':
        usePlayerStore.getState().enqueueEnd(track);
        break;
      case 'add-to-playlist':
        Alert.alert('Coming soon', 'Add-to-playlist not built yet.');
        break;
      case 'download':
        Alert.alert('Coming soon', 'Offline downloads not built yet.');
        break;
      case 'none':
        break;
    }
  }

  const row = (
    <Pressable haptic={false} onPress={onPress} style={[styles.row, { backgroundColor: colors.background }]}>
      {showArtwork ? (
        <Artwork uri={artUri} size={48} radius={Radius.sm} />
      ) : index !== undefined ? (
        <View style={styles.indexCol}>
          <Text variant="callout" tone="secondary">
            {index + 1}
          </Text>
        </View>
      ) : null}
      <View style={styles.meta}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {track.title}
          </Text>
          {isFavorite ? (
            <Icon name="heart.fill" size={11} color={colors.accent} />
          ) : null}
        </View>
        {showArtist ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {track.artist?.name ?? 'Unknown Artist'}
          </Text>
        ) : null}
      </View>
      {showDuration ? (
        <Text variant="footnote" tone="secondary">
          {formatDuration(track.duration_secs)}
        </Text>
      ) : null}
      <Pressable haptic="light" onPress={onMore} hitSlop={10} style={styles.more}>
        <Icon name="ellipsis" size={18} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );

  if (!swipeable || (leftAction === 'none' && rightAction === 'none')) {
    return row;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={70}
      rightThreshold={70}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        leftAction === 'none'
          ? undefined
          : () => (
              <ActionPanel
                action={leftAction}
                isFavorite={isFavorite}
                side="left"
              />
            )
      }
      renderRightActions={
        rightAction === 'none'
          ? undefined
          : () => (
              <ActionPanel
                action={rightAction}
                isFavorite={isFavorite}
                side="right"
              />
            )
      }
      onSwipeableOpen={(direction) => {
        runAction(direction === 'left' ? leftAction : rightAction);
      }}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

function ActionPanel({
  action,
  isFavorite,
  side,
}: {
  action: SwipeAction;
  isFavorite: boolean;
  side: 'left' | 'right';
}) {
  const showFavoriteToggle = action === 'favorite' && isFavorite;
  const icon = (showFavoriteToggle ? 'heart.slash.fill' : SWIPE_ACTION_ICONS[action]) as SymbolViewProps['name'];
  const label = showFavoriteToggle ? 'Unfavorite' : SWIPE_ACTION_LABELS[action];
  const bg = SWIPE_ACTION_COLORS[action];
  return (
    <View
      style={[
        styles.actionPanel,
        { backgroundColor: bg, alignItems: side === 'left' ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View style={styles.actionInner}>
        <Icon name={icon} size={20} color="#FFFFFF" />
        <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '600' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    gap: Spacing.md,
    minHeight: 64,
  },
  indexCol: { width: 28, alignItems: 'center' },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  more: { paddingLeft: 4 },
  actionPanel: {
    width: 96,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  actionInner: { alignItems: 'center', gap: 4 },
});
