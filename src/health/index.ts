import { mockSource } from './sources/mock';
import type { HealthDataSource } from './types';

export * from './types';

/**
 * データソースの選択:
 * - EXPO_PUBLIC_MOCK_HEALTH=1 なら強制的にモック(コンテナ内・Web開発用)。
 * - それ以外はプラットフォーム解決される './sources/native' がOS実装を返す
 *   (native.ios.ts → HealthKit、native.android.ts → Health Connect、
 *   native.web.ts → なし)。ネイティブモジュール未リンク環境(Expo Go)では
 *   生成時に例外になるため、モックへフォールバックしてアプリは動き続ける。
 */
let source: HealthDataSource | null = null;

export function getHealthSource(): HealthDataSource {
  if (source) return source;

  if (process.env.EXPO_PUBLIC_MOCK_HEALTH !== '1') {
    try {
      // Metroがプラットフォーム別ファイルを選ぶので、WebバンドルにネイティブSDKは入らない
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
