import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Header-right gear that opens the settings modal. */
export function SettingsLink() {
  const theme = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityLabel="設定" style={{ paddingHorizontal: Spacing.three }}>
        <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
      </Pressable>
    </Link>
  );
}
