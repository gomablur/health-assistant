import type { HealthDataSource } from '../types';

/** Fallback for platforms without a specific implementation (tests, node). */
export function createNativeSource(): HealthDataSource | null {
  return null;
}
