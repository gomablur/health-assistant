import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { SettingsLink } from '@/components/settings-link';
import { useTheme } from '@/hooks/use-theme';

/** Web用フォールバック: ヘッダー付きJSタブ(ネイティブはNativeTabsを使用)。 */
export default function AppTabs() {
  const theme = useTheme();
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
