import { useState } from 'react';
import Constants from 'expo-constants';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { ActionSheet, type ActionItem } from '@/components/ActionSheet';
import { useAuthStore } from '@/lib/auth/store';
import { useServerStore } from '@/lib/servers/store';
import { useSettingsStore, SWIPE_ACTION_LABELS, type SwipeAction } from '@/lib/settings/store';
import { playerEngine } from '@/lib/player/engine';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing, TabBarHeight, MiniPlayerHeight } from '@/theme/tokens';
import type { SymbolViewProps } from 'expo-symbols';

const SWIPE_OPTIONS: SwipeAction[] = [
  'favorite',
  'queue-next',
  'queue-end',
  'add-to-playlist',
  'download',
  'none',
];

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const server = useServerStore((s) => s.active());
  const leftSwipe = useSettingsStore((s) => s.leftSwipeAction);
  const rightSwipe = useSettingsStore((s) => s.rightSwipeAction);
  const setLeft = useSettingsStore((s) => s.setLeftSwipeAction);
  const setRight = useSettingsStore((s) => s.setRightSwipeAction);
  const [editing, setEditing] = useState<null | 'left' | 'right'>(null);

  const swipeMenuItems: ActionItem[] = SWIPE_OPTIONS.map((opt) => ({
    label: SWIPE_ACTION_LABELS[opt],
    icon:
      (editing === 'left' && leftSwipe === opt) || (editing === 'right' && rightSwipe === opt)
        ? 'checkmark'
        : undefined,
    onPress: () => {
      if (editing === 'left') setLeft(opt);
      else if (editing === 'right') setRight(opt);
    },
  }));

  function onLogout() {
    Alert.alert('Sign out?', 'You will be returned to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          playerEngine.stop();
          await clear();
          router.replace('/auth/login');
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert(
      'Delete account?',
      'This action is permanent. (Server-side delete endpoint not yet implemented.)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TabBarHeight + MiniPlayerHeight + Spacing.lg }}
      >
        <ScreenHeader title="Profile" />

        <View style={styles.userCard}>
          <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
            <Icon name="person.fill" size={36} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title3">{user?.username ?? 'Guest'}</Text>
            <Text variant="footnote" tone="secondary">
              {user?.email ?? '—'}
            </Text>
            {user?.role ? (
              <Text variant="caption" tone="accent" style={{ marginTop: 2 }}>
                {user.role.toUpperCase()}
              </Text>
            ) : null}
          </View>
        </View>

        <Section title="Server">
          <Row
            icon="server.rack"
            label="Active server"
            value={server?.name ?? 'None'}
            onPress={() => router.push('/connection')}
          />
          <Row icon="link" label="URL" value={server?.baseUrl ?? '—'} />
        </Section>

        <Section title="Appearance">
          <Row
            icon="paintpalette"
            label="Theme"
            value="System"
            onPress={() => Alert.alert('Theme', 'Theme switcher coming soon.')}
          />
          <Row
            icon="sparkles"
            label="Accent color"
            value="Apple Music Red"
            onPress={() => Alert.alert('Accent', 'Custom accents coming soon.')}
          />
        </Section>

        <Section title="Swipe Actions">
          <Row
            icon="arrow.right"
            label="Swipe Right (from left)"
            value={SWIPE_ACTION_LABELS[leftSwipe]}
            onPress={() => setEditing('left')}
          />
          <Row
            icon="arrow.left"
            label="Swipe Left (from right)"
            value={SWIPE_ACTION_LABELS[rightSwipe]}
            onPress={() => setEditing('right')}
          />
        </Section>

        <Section title="Account">
          <Row icon="rectangle.portrait.and.arrow.right" label="Sign out" destructive onPress={onLogout} />
          <Row icon="trash" label="Delete account" destructive onPress={onDelete} />
        </Section>

        <Section title="About">
          <Row icon="info.circle" label="App version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </Section>
      </ScrollView>

      <ActionSheet
        visible={editing !== null}
        title={editing === 'left' ? 'Right swipe action' : 'Left swipe action'}
        items={swipeMenuItems}
        onClose={() => setEditing(null)}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: Spacing.lg }}>
      <Text
        variant="footnote"
        tone="secondary"
        style={{ paddingHorizontal: Spacing.lg, paddingBottom: 6, textTransform: 'uppercase' }}
      >
        {title}
      </Text>
      <View
        style={{
          marginHorizontal: Spacing.lg,
          backgroundColor: colors.surface,
          borderRadius: Radius.md,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.destructive : colors.text;
  return (
    <Pressable haptic="light" onPress={onPress} style={styles.row}>
      <Icon name={icon} size={20} color={tint} />
      <Text variant="callout" style={{ color: tint, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ maxWidth: 200 }}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevron.right" size={14} color={colors.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
});
