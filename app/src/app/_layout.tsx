import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '@/lib/auth/store';
import { useServerStore } from '@/lib/servers/store';
import { useSettingsStore } from '@/lib/settings/store';
import { useLibraryStore } from '@/lib/library/store';
import { PlayerEngineProvider } from '@/lib/player/engine';
import { PlayerOverlay } from '@/components/PlayerOverlay';

export default function RootLayout() {
  const scheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  const authHydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  const serverHydrated = useServerStore((s) => s.hydrated);
  const activeId = useServerStore((s) => s.activeId);
  const hydrateServers = useServerStore((s) => s.hydrate);

  useEffect(() => {
    hydrateAuth();
    hydrateServers();
    useSettingsStore.getState().hydrate();
  }, [hydrateAuth, hydrateServers]);

  useEffect(() => {
    if (authHydrated && accessToken) {
      useLibraryStore.getState().refresh().catch(() => {});
    }
  }, [authHydrated, accessToken]);

  useEffect(() => {
    if (!authHydrated || !serverHydrated) return;
    const root = segments[0];
    const inAuth = root === 'auth';
    const inConnection = root === 'connection';
    const inTabs = root === '(tabs)';
    const atIndex = !root;

    if (!activeId) {
      if (!inConnection) router.replace('/connection');
      return;
    }
    if (!accessToken) {
      if (!inAuth && !inConnection) router.replace('/auth/login');
      return;
    }
    if (atIndex || inAuth || inConnection) {
      if (!inTabs) router.replace('/(tabs)/discover');
    }
  }, [authHydrated, serverHydrated, accessToken, activeId, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PlayerEngineProvider>
          <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="connection/index" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/register" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="player"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          </Stack>
          <PlayerOverlay />
        </PlayerEngineProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
