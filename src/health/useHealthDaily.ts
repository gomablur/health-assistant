import { useCallback, useEffect, useState } from 'react';

import { addDays, todayISO } from '@/utils/date';
import { getHealthSource } from './index';
import type { DailyPoint, MetricType } from './types';

interface State {
  /** データがどのクエリキーのものか — loading はキー不一致から導出する */
  key: string | null;
  data: DailyPoint[] | null;
  error: string | null;
}

const cache = new Map<string, DailyPoint[]>();

/** メモリ上のクエリキャッシュを破棄する(権限変更後・手動リフレッシュ時)。 */
export function invalidateHealthCache() {
  cache.clear();
}

/**
 * 直近 `days` 日(今日を含む)の日次系列を返すフック。
 * 新しいクエリの実行中も前のデータを返し続けるので、期間切り替えで
 * チャートが一瞬空になるちらつきが起きない。
 */
export function useHealthDaily(metric: MetricType, days: number) {
  const [state, setState] = useState<State>({ key: null, data: null, error: null });
  const [refreshToken, setRefreshToken] = useState(0);
  const key = `${metric}:${days}:${todayISO()}:${refreshToken}`;

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${metric}:${days}:${todayISO()}`;
    const cached = cache.get(cacheKey);
    const end = todayISO();
    const start = addDays(end, -(days - 1));
    const promise = cached
      ? Promise.resolve(cached)
      : getHealthSource().queryDaily(metric, start, end);
    promise
      .then((data) => {
        cache.set(cacheKey, data);
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ key, data: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, metric, days]);

  const refresh = useCallback(() => {
    invalidateHealthCache();
    setRefreshToken((t) => t + 1);
  }, []);

  return {
    data: state.data,
    loading: state.key !== key,
    error: state.key === key ? state.error : null,
    refresh,
  };
}
