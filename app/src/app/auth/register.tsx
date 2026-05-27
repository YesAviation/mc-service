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
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.register({ username, email, password });
      await setSession({
        accessToken: res.access_token,
        refreshToken: res.refresh_token,
        user: res.user,
      });
      router.replace('/(tabs)/discover');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text variant="largeTitle">Create Account</Text>
        </View>
        <View style={styles.form}>
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="newPassword"
            error={error}
          />
          <Button title="Sign Up" onPress={onSubmit} loading={busy} />
        </View>
        <Pressable haptic="light" onPress={() => router.back()} style={{ alignSelf: 'center' }}>
          <Text variant="footnote" tone="accent">
            Already have an account? Sign in
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg },
  form: { gap: Spacing.md },
});
