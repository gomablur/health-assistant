import { useCallback, useEffect, useState } from 'react';

import { addDays, todayISO } from '@/utils/date';
import { getHealthSource } from './index';
import type { DailyPoint, MetricType } from './types';

interface State {
  data: DailyPoint[] | null;
  loading: boolean;
  error: string | null;
}

const cache = new Map<string, DailyPoint[]>();

/** Clear the in-memory query cache (after permission changes / manual refresh). */
export function invalidateHealthCache() {
  cache.clear();
}

/** Daily series for the past `days` days (today inclusive). */
export function useHealthDaily(metric: MetricType, days: number) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const key = `${metric}:${days}:${todayISO()}`;
    const cached = cache.get(key);
    if (cached && refreshToken === 0) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const end = todayISO();
    const start = addDays(end, -(days - 1));
    getHealthSource()
      .queryDaily(metric, start, end)
      .then((data) => {
        cache.set(key, data);
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [metric, days, refreshToken]);

  const refresh = useCallback(() => {
    invalidateHealthCache();
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
