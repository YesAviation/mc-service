import { useState } from 'react';
import { Alert, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artwork } from '@/components/Artwork';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Pressable } from '@/components/Pressable';
import { Slider } from '@/components/Slider';
import { CircleButton } from '@/components/CircleButton';
import { ActionSheet, type ActionItem } from '@/components/ActionSheet';
import { PlayerBackdrop } from '@/components/PlayerBackdrop';
import { usePlayerStore } from '@/lib/player/store';
import { playerEngine } from '@/lib/player/engine';
import { useServerStore } from '@/lib/servers/store';
import { useLibraryStore } from '@/lib/library/store';
import { ensureAbsoluteUrl, formatMillis } from '@/lib/format';
import { Spacing } from '@/theme/tokens';

const FG = '#FFFFFF';
const FG_DIM = 'rgba(255,255,255,0.72)';
const FG_FAINT = 'rgba(255,255,255,0.42)';
const SIDE_PAD = 28;

export default function PlayerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const current = usePlayerStore((s) => s.current());
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMillis = usePlayerStore((s) => s.positionMillis);
  const durationMillis = usePlayerStore((s) => s.durationMillis);
  const repeat = usePlayerStore((s) => s.repeat);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const volume = usePlayerStore((s) => s.volume);
  const server = useServerStore((s) => s.active());
  const isFavorite = useLibraryStore((s) => (current ? s.ids.has(current.id) : false));
  const [menuOpen, setMenuOpen] = useState(false);

  if (!current) {
    return (
      <View style={[styles.fill, { backgroundColor: '#000' }]}>
        <SafeAreaView style={styles.fill}>
          <Text variant="title2" style={{ textAlign: 'center', marginTop: 80, color: FG }}>
            Nothing playing
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  const artUri = ensureAbsoluteUrl(server?.baseUrl, current.album?.artwork_url ?? null);
  const artSize = Math.min(width - SIDE_PAD * 2, 360);
  const remaining = Math.max(0, durationMillis - positionMillis);

  function toggleFavorite() {
    if (current) {
      useLibraryStore.getState().toggle(current.id).catch((err) => {
        Alert.alert('Could not update library', err?.message ?? 'Unknown error');
      });
    }
  }

  const menuItems: ActionItem[] = [
    {
      label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: isFavorite ? 'star.slash' : 'star',
      onPress: toggleFavorite,
    },
    {
      label: shuffle ? 'Shuffle Off' : 'Shuffle On',
      icon: 'shuffle',
      onPress: () => usePlayerStore.getState().toggleShuffle(),
    },
    {
      label: 'Add to Playlist…',
      icon: 'text.badge.plus',
      onPress: () => Alert.alert('Coming soon', 'Add-to-playlist flow not built yet.'),
    },
    {
      label: 'Download',
      icon: 'arrow.down.circle',
      onPress: () => Alert.alert('Coming soon', 'Offline downloads not built yet.'),
    },
    {
      label: 'Go to Album',
      icon: 'square.stack',
      onPress: () => current.album && router.replace(`/album/${current.album.id}`),
    },
    {
      label: 'Go to Artist',
      icon: 'music.mic',
      onPress: () => current.artist && router.replace(`/artist/${current.artist.id}`),
    },
    {
      label: 'Share',
      icon: 'square.and.arrow.up',
      onPress: () => Alert.alert('Coming soon', 'Sharing not implemented yet.'),
    },
  ];

  const codecLabel = current.metadata_json ? '' : '';

  return (
    <View style={styles.fill}>
      <PlayerBackdrop uri={artUri} />
      <SafeAreaView style={styles.fill}>
        <View style={styles.handleRow}>
          <Pressable haptic="light" onPress={() => router.back()} hitSlop={20}>
            <View style={styles.handle} />
          </Pressable>
        </View>

        <View style={styles.artWrap}>
          <Artwork uri={artUri} size={artSize} radius={14} />
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: Spacing.md }}>
              <Text
                numberOfLines={1}
                style={{ color: FG, fontSize: 24, fontWeight: '700', letterSpacing: -0.3 }}
              >
                {current.title}
              </Text>
              <Pressable
                haptic={false}
                onPress={() => current.artist && router.replace(`/artist/${current.artist.id}`)}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: FG_DIM, fontSize: 19, fontWeight: '400', marginTop: 2 }}
                >
                  {current.artist?.name ?? 'Unknown Artist'}
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <CircleButton
                icon={isFavorite ? 'star.fill' : 'star'}
                onPress={toggleFavorite}
                active={isFavorite}
              />
              <CircleButton icon="ellipsis" onPress={() => setMenuOpen(true)} />
            </View>
          </View>

          <View style={{ marginTop: Spacing.xl }}>
            <Slider
              value={positionMillis}
              max={Math.max(1, durationMillis)}
              onSlidingComplete={(v) => playerEngine.seekTo(v)}
              trackHeight={4}
            />
            <View style={styles.timeRow}>
              <Text
                variant="caption"
                style={{ color: FG_DIM, fontVariant: ['tabular-nums'], width: 50 }}
              >
                {formatMillis(positionMillis)}
              </Text>
              <Text
                variant="caption"
                style={{ color: FG_FAINT, flex: 1, textAlign: 'center' }}
                numberOfLines={1}
              >
                {codecLabel}
              </Text>
              <Text
                variant="caption"
                style={{ color: FG_DIM, fontVariant: ['tabular-nums'], width: 50, textAlign: 'right' }}
              >
                -{formatMillis(remaining)}
              </Text>
            </View>
          </View>

          <View style={styles.transport}>
            <Pressable haptic="medium" onPress={() => playerEngine.previous()} hitSlop={24}>
              <Icon name="backward.fill" size={42} color={FG} />
            </Pressable>
            <Pressable haptic="medium" onPress={() => playerEngine.toggle()} hitSlop={24}>
              <Icon name={isPlaying ? 'pause.fill' : 'play.fill'} size={70} color={FG} />
            </Pressable>
            <Pressable haptic="medium" onPress={() => playerEngine.next()} hitSlop={24}>
              <Icon name="forward.fill" size={42} color={FG} />
            </Pressable>
          </View>

          <View style={styles.volumeRow}>
            <Icon name="speaker.fill" size={15} color={FG_FAINT} />
            <View style={{ flex: 1 }}>
              <Slider
                value={volume * 100}
                max={100}
                onSlidingComplete={(v) => playerEngine.setVolume(v / 100)}
                trackHeight={4}
              />
            </View>
            <Icon name="speaker.wave.3.fill" size={15} color={FG_FAINT} />
          </View>

          <View style={styles.utilityRow}>
            <UtilCell>
              <Pressable
                haptic="light"
                onPress={() => usePlayerStore.getState().toggleShuffle()}
                hitSlop={12}
              >
                <Icon name="shuffle" size={22} color={shuffle ? FG : FG_FAINT} />
              </Pressable>
            </UtilCell>
            <UtilCell>
              <Pressable
                haptic="light"
                onPress={() => Alert.alert('Coming soon', 'Lyrics not built yet.')}
                hitSlop={12}
              >
                <Icon name="quote.bubble" size={22} color={FG} />
              </Pressable>
            </UtilCell>
            <UtilCell>
              <Pressable
                haptic="light"
                onPress={() =>
                  Alert.alert(
                    'Output device',
                    'AirPlay device picker requires native code; using current output.',
                  )
                }
                hitSlop={12}
              >
                <Icon
                  name={Platform.OS === 'ios' ? 'airpodspro' : 'speaker.wave.2.fill'}
                  size={22}
                  color={FG}
                />
              </Pressable>
            </UtilCell>
            <UtilCell>
              <Pressable
                haptic="light"
                onPress={() => Alert.alert('Coming soon', 'Queue view not built yet.')}
                hitSlop={12}
              >
                <Icon name="list.bullet" size={22} color={FG} />
              </Pressable>
            </UtilCell>
            <UtilCell>
              <Pressable
                haptic="light"
                onPress={() => usePlayerStore.getState().cycleRepeat()}
                hitSlop={12}
              >
                <Icon
                  name={repeat === 'one' ? 'repeat.1' : 'repeat'}
                  size={22}
                  color={repeat !== 'off' ? FG : FG_FAINT}
                />
              </Pressable>
            </UtilCell>
          </View>
        </View>
      </SafeAreaView>

      <ActionSheet
        visible={menuOpen}
        title={current.title}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  handleRow: { alignItems: 'center', paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: FG_FAINT },
  artWrap: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xxxl,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  content: { flex: 1, paddingHorizontal: SIDE_PAD },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: Spacing.xxl,
    paddingHorizontal: Spacing.sm,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xxl,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  utilCell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function UtilCell({ children }: { children: React.ReactNode }) {
  return <View style={styles.utilCell}>{children}</View>;
}
