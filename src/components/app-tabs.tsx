import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * OSネイティブのタブバー: iOS 26ではLiquid Glass、AndroidではMaterial 3。
 * WebはJS実装(app-tabs.web.tsx)を使う。
 * 注意: ネイティブタブは自前のヘッダーを持たないため、ヘッダーはルートの
 * Stack(src/app/_layout.tsx)が提供している。
 */
export default function AppTabs() {
  return (
    <NativeTabs>
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
