import type { HealthDataSource } from '../types';

/** Web has no OS health store; the caller falls back to mock. */
export function createNativeSource(): HealthDataSource | null {
  return null;
}
