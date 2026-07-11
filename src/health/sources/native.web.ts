import type { HealthDataSource } from '../types';

/** WebにはOSのヘルスデータストアがない。呼び出し側がモックへフォールバックする。 */
export function createNativeSource(): HealthDataSource | null {
  return null;
}
