import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Pressable } from '@/components/Pressable';
import { Icon } from '@/components/Icon';
import { useServerStore } from '@/lib/servers/store';
import { pingServer } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { Radius, Spacing } from '@/theme/tokens';

export default function ConnectionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const servers = useServerStore((s) => s.servers);
  const activeId = useServerStore((s) => s.activeId);
  const add = useServerStore((s) => s.add);
  const setActive = useServerStore((s) => s.setActive);
  const remove = useServerStore((s) => s.remove);
  const hydrated = useServerStore((s) => s.hydrated);
  const hydrate = useServerStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  async function onSubmit() {
    setError(null);
    if (!url.trim()) {
      setError('Server URL is required');
      return;
    }
    let candidate = url.trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = `http://${candidate}`;

    setBusy(true);
    const ok = await pingServer(candidate);
    if (!ok) {
      setBusy(false);
      setError('Could not reach server. Check the URL and try again.');
      return;
    }

    await add({ name: name.trim() || candidate, baseUrl: candidate });
    setBusy(false);
    setName('');
    setUrl('');
    router.replace('/auth/login');
  }

  async function onSelect(id: string) {
    await setActive(id);
    router.replace('/auth/login');
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="largeTitle">Connect to a Server</Text>
          <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.xs }}>
            Point the app at your self-hosted music server.
          </Text>
        </View>

        <View style={styles.card}>
          <TextField
            label="Display Name (optional)"
            placeholder="Home Server"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <TextField
            label="Server URL"
            placeholder="https://music.example.com"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            error={error}
          />
          <Button title="Connect" onPress={onSubmit} loading={busy} />
        </View>

        {servers.length > 0 ? (
          <View style={[styles.card, { gap: Spacing.sm }]}>
            <Text variant="headline" style={{ marginBottom: Spacing.xs }}>
              Saved Servers
            </Text>
            {servers.map((s) => {
              const active = s.id === activeId;
              return (
                <View
                  key={s.id}
                  style={[
                    styles.serverRow,
                    { backgroundColor: colors.surfaceMuted, borderRadius: Radius.md },
                  ]}
                >
                  <Pressable
                    haptic="light"
                    style={{ flex: 1, padding: Spacing.md }}
                    onPress={() => onSelect(s.id)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                      <Icon
                        name={active ? 'checkmark.circle.fill' : 'circle'}
                        size={20}
                        color={active ? colors.accent : colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="callout" style={{ fontWeight: '600' }}>
                          {s.name}
                        </Text>
                        <Text variant="footnote" tone="secondary" numberOfLines={1}>
                          {s.baseUrl}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    haptic="light"
                    style={{ padding: Spacing.md }}
                    onPress={() => remove(s.id)}
                    hitSlop={8}
                  >
                    <Icon name="trash" size={18} color={colors.destructive} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg },
  card: { gap: Spacing.md },
  serverRow: { flexDirection: 'row', alignItems: 'center' },
});
