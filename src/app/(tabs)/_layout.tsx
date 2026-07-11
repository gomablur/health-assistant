import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useSettings } from '@/store/settings';

/** ゲート: オンボーディング完了ユーザーのみタブを描画する。 */
export default function TabsLayout() {
  const { hydrated, onboarded } = useSettings();

  if (!hydrated) return null; // ハイドレーション完了まではルートがスプラッシュを保持している
  if (!onboarded) return <Redirect href="/onboarding" />;

  return <AppTabs />;
}
