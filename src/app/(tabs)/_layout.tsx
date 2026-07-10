import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

function SettingsLink() {
  const theme = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityLabel="設定" style={{ paddingHorizontal: Spacing.three }}>
        <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
      </Pressable>
    </Link>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const { hydrated, onboarded } = useSettings();

  if (!hydrated) return null; // splash overlay still covers the screen
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textMuted,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text },
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.grid },
        headerRight: () => <SettingsLink />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="weight"
        options={{
          title: '体重',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-down-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'アクティビティ',
          tabBarIcon: ({ color, size }) => <Ionicons name="walk-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'AIコーチ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
