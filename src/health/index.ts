import { mockSource } from './sources/mock';
import type { HealthDataSource } from './types';

export * from './types';

/**
 * Source selection:
 * - EXPO_PUBLIC_MOCK_HEALTH=1 forces mock (container / web development).
 * - Otherwise the platform-resolved './sources/native' module provides the
 *   OS-backed source (native.ios.ts → HealthKit, native.android.ts → Health
 *   Connect, native.web.ts → none). When the native module is not linked
 *   (Expo Go) creating it throws and we fall back to mock so the app stays usable.
 */
let source: HealthDataSource | null = null;

export function getHealthSource(): HealthDataSource {
  if (source) return source;

  if (process.env.EXPO_PUBLIC_MOCK_HEALTH !== '1') {
    try {
      // Metro picks the platform-specific file, so web never bundles native SDKs.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const native = require('./sources/native').createNativeSource as
        | (() => HealthDataSource | null)
        | undefined;
      source = native?.() ?? null;
    } catch {
      source = null;
    }
  }
  source ??= mockSource;
  return source;
}

export function isMockSource(): boolean {
  return getHealthSource().kind === 'mock';
}
