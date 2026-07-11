import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SettingsLink } from '@/components/settings-link';
import { Colors } from '@/constants/theme';
import { hydrateSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync();

/** native tabs have no headers of their own — the root stack provides one */
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

  useEffect(() => {
    hydrateSettings();
  }, []);

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
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            // web tabs (JS) bring their own headers; native tabs rely on this one
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
