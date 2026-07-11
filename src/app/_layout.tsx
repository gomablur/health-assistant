import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { SettingsLink } from '@/components/settings-link';
import { Colors } from '@/constants/theme';
import { hydrateSettings, useSettings } from '@/store/settings';

// 設定の読み込みが終わるまでネイティブスプラッシュを保持する。最初に見える
// フレームが正しい画面(タブ or オンボーディングへのリダイレクト)になる。
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 200 });

/** ネイティブタブは自前ヘッダーを持たないため、ルートStackがヘッダーを提供する */
const TAB_TITLES: Record<string, string> = {
  '/': 'ホーム',
  '/weight': '体重',
  '/activity': 'アクティビティ',
  '/coach': 'AIコーチ',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const theme = Colors[dark ? 'dark' : 'light'];
  const pathname = usePathname();
  const hydrated = useSettings((s) => s.hydrated);

  useEffect(() => {
    hydrateSettings();
  }, []);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      primary: theme.tint,
      border: theme.grid,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            // Webタブ(JS実装)は自前ヘッダー持ち。ネイティブタブはこのヘッダーに依存する
            headerShown: Platform.OS !== 'web',
            title: TAB_TITLES[pathname] ?? '',
            headerRight: () => <SettingsLink />,
          }}
        />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', title: '設定' }} />
      </Stack>
    </ThemeProvider>
  );
}
