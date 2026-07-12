import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * OSネイティブのタブバー: iOS 26ではLiquid Glass、AndroidではMaterial 3。
 * WebはJS実装(app-tabs.web.tsx)を使う。
 * 注意: ネイティブタブは自前のヘッダーを持たないため、ヘッダーはルートの
 * Stack(src/app/_layout.tsx)が提供している。
 *
 * 色を指定しないと、iOSはシステム標準の青、Androidは壁紙由来のMaterial You
 * ダイナミックカラーになる(アイコン・ラベルだけでなく、タブバーの背景=
 * surfaceContainer と波紋=primary も緑がかる)。すべてブランド色で上書きする。
 *
 * ただし背景色と波紋色はAndroid限定。iOSで backgroundColor を渡すと
 * タブバーが不透明になり、Liquid Glassの透過が効かなくなる。
 */
export default function AppTabs() {
  const theme = useTheme();
  const androidColors =
    Platform.OS === 'android'
      ? {
          backgroundColor: theme.surface,
          rippleColor: theme.tintRipple,
          indicatorColor: theme.backgroundSelected,
        }
      : {};
  return (
    <NativeTabs tintColor={theme.tint} {...androidColors}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>ホーム</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="weight">
        <NativeTabs.Trigger.Label>体重</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'scalemass', selected: 'scalemass.fill' }}
          md="monitor_weight"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>アクティビティ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.walk" md="directions_walk" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="coach">
        <NativeTabs.Trigger.Label>AIコーチ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
