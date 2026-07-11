import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * Webの静的レンダリング対応: サーバー側ではカラースキームが分からないため、
 * ハイドレーション完了までは 'light' を返し、完了後にクライアントの値へ切り替える。
 */
export function useColorScheme() {
  // サーバー/静的レンダリング中は false、クライアントでのハイドレーション後に true
  const hasHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
