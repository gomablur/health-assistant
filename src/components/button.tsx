import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

/**
 * 自前実装のボタン(Web用)。ネイティブは button.ios.tsx (SwiftUI) と
 * button.android.tsx (Jetpack Compose) が優先される。
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const dimmed = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={dimmed}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.tintFill : theme.backgroundElement },
        (pressed || dimmed) && { opacity: pressed ? 0.75 : 0.45 },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? theme.tintOnFill : theme.text} />
      ) : (
        <ThemedText type="smallBold" style={{ color: primary ? theme.tintOnFill : theme.text }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    minHeight: 44,
  },
});
