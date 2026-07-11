import type { HealthDataSource } from '../types';

/** プラットフォーム別実装がない環境(テスト・node)向けのフォールバック。 */
export function createNativeSource(): HealthDataSource | null {
  return null;
}
