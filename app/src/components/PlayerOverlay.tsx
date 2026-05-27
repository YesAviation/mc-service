import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { MiniPlayer } from './MiniPlayer';
import { usePlayerStore } from '@/lib/player/store';
import { Spacing } from '@/theme/tokens';

const HIDDEN_ROOTS = new Set(['player', 'auth', 'connection', 'search']);

// React Navigation default bottom-tab bar height (excluding the safe-area
// inset that gets added on top). Matches @react-navigation/bottom-tabs.
const TAB_BAR_BASE_HEIGHT = Platform.OS === 'ios' ? 49 : 56;

export function PlayerOverlay() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const hasTrack = usePlayerStore((s) => s.queue.length > 0);

  if (!hasTrack) return null;
  const root = segments[0];
  if (root && HIDDEN_ROOTS.has(root)) return null;

  const onTabs = root === '(tabs)';
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + insets.bottom;
  const bottom = onTabs
    ? tabBarHeight + Spacing.xs
    : insets.bottom > 0
      ? insets.bottom + Spacing.xs
      : Spacing.sm;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
