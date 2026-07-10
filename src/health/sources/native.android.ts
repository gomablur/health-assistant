import type { HealthDataSource } from '../types';
import { healthConnectSource } from './healthconnect';

export function createNativeSource(): HealthDataSource | null {
  return healthConnectSource;
}
