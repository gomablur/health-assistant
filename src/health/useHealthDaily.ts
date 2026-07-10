import { useCallback, useEffect, useState } from 'react';

import { addDays, todayISO } from '@/utils/date';
import { getHealthSource } from './index';
import type { DailyPoint, MetricType } from './types';

interface State {
  /** query key the data belongs to — loading is derived from key mismatch */
  key: string | null;
  data: DailyPoint[] | null;
  error: string | null;
}

const cache = new Map<string, DailyPoint[]>();

/** Clear the in-memory query cache (after permission changes / manual refresh). */
export function invalidateHealthCache() {
  cache.clear();
}

/**
 * Daily series for the past `days` days (today inclusive). While a new query
 * is in flight the previous data stays available, so period switches don't
 * flash empty charts.
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
