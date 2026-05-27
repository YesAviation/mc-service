import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Pressable } from '@/components/Pressable';
import { authApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth/store';
import { useServerStore } from '@/lib/servers/store';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/theme/tokens';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const server = useServerStore((s) => s.active());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.login({ username, password });
      await setSession({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        user: res.user,
      });
      router.replace('/(tabs)/discover');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="largeTitle">Sign In</Text>
          <Text variant="callout" tone="secondary" style={{ marginTop: Spacing.xs }}>
            {server?.name ?? 'No server selected'}
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Username"
            placeholder="username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
          <TextField
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="password"
            error={error}
          />
          <Button title="Sign In" onPress={onSubmit} loading={busy} />
        </View>

        <View style={styles.linkRow}>
          <Pressable haptic="light" onPress={() => router.push('/auth/register')}>
            <Text variant="footnote" tone="accent">
              Create account
            </Text>
          </Pressable>
          <Pressable haptic="light" onPress={() => router.replace('/connection')}>
            <Text variant="footnote" tone="secondary">
              Change server
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg },
  form: { gap: Spacing.md },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
});
