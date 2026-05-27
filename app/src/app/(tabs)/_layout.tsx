import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { GlassSurface } from '@/components/GlassSurface';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/hooks/useTheme';
import type { SymbolViewProps } from 'expo-symbols';

const ICONS: Record<string, { active: SymbolViewProps['name']; inactive: SymbolViewProps['name'] }> = {
  discover: { active: 'play.square.stack.fill', inactive: 'play.square.stack' },
  radio: { active: 'dot.radiowaves.left.and.right', inactive: 'dot.radiowaves.left.and.right' },
  library: { active: 'square.stack.fill', inactive: 'square.stack' },
  profile: { active: 'person.crop.circle.fill', inactive: 'person.crop.circle' },
};

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          ...(Platform.OS === 'android' ? { elevation: 0 } : null),
        },
        tabBarBackground: () => <GlassSurface style={StyleSheet.absoluteFill} />,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused, color, size }) => (
            <Icon name={focused ? ICONS.discover.active : ICONS.discover.inactive} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="radio"
        options={{
          title: 'Radio',
          tabBarIcon: ({ focused, color, size }) => (
            <Icon name={focused ? ICONS.radio.active : ICONS.radio.inactive} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused, color, size }) => (
            <Icon name={focused ? ICONS.library.active : ICONS.library.inactive} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color, size }) => (
            <Icon name={focused ? ICONS.profile.active : ICONS.profile.inactive} size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen name="album/[id]" options={{ href: null }} />
      <Tabs.Screen name="artist/[id]" options={{ href: null }} />
      <Tabs.Screen name="playlist/[id]" options={{ href: null }} />
      <Tabs.Screen name="browse/albums" options={{ href: null }} />
      <Tabs.Screen name="browse/artists" options={{ href: null }} />
    </Tabs>
  );
}
