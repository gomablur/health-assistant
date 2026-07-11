import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useSettings } from '@/store/settings';

export default function TabsLayout() {
  const { hydrated, onboarded } = useSettings();

  if (!hydrated) return null; // splash overlay still covers the screen
  if (!onboarded) return <Redirect href="/onboarding" />;

  return <AppTabs />;
}
