import type { HealthDataSource } from '../types';
import { healthKitSource } from './healthkit';

export function createNativeSource(): HealthDataSource | null {
  return healthKitSource;
}
