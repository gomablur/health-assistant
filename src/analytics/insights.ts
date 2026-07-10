import type { DailyPoint } from '@/health/types';
import { todayISO } from '@/utils/date';
import { correlateDaily, ewma, lastDays, linearTrend, mean, movingAverage } from './stats';

/** Derived numbers the weight screen and the coach both need. */
export interface WeightInsight {
  latest: DailyPoint | null;
  /** smoothed "true" weight (EWMA, half-life 7 days) at the latest measurement */
  trendWeight: number | null;
  /** kg per week over the last 28 days of measurements */
  slopePerWeek: number | null;
  /** how well the 28-day linear fit explains the data, 0..1 */
  trendR2: number | null;
  /** average of the last 7 / previous 7 calendar days */
  avg7: number | null;
  prevAvg7: number | null;
  /** measurement adherence over the last 28 days, 0..1 */
  adherence28: number;
}

export function weightInsight(weight: DailyPoint[], endISO = todayISO()): WeightInsight {
  const latest = weight.length > 0 ? weight[weight.length - 1] : null;
  const smoothed = ewma(weight, 7);
  const trendWeight = smoothed.length > 0 ? smoothed[smoothed.length - 1].value : null;
  const last28 = lastDays(weight, 28, endISO);
  const trend = linearTrend(last28);
  const avg7 = mean(lastDays(weight, 7, endISO).map((p) => p.value));
  const prevAvg7 = mean(
    lastDays(weight, 14, endISO)
      .filter((p) => !lastDays(weight, 7, endISO).includes(p))
      .map((p) => p.value),
  );
  return {
    latest,
    trendWeight,
    slopePerWeek: trend?.slopePerWeek ?? null,
    trendR2: trend?.r2 ?? null,
    avg7,
    prevAvg7,
    adherence28: last28.length / 28,
  };
}

/** Pace assessment against the commonly recommended safe bound (±0.5 kg/week). */
export type Pace = 'losing-fast' | 'losing' | 'stable' | 'gaining' | 'gaining-fast';

export function assessPace(slopePerWeek: number): Pace {
  if (slopePerWeek <= -0.5) return 'losing-fast';
  if (slopePerWeek <= -0.1) return 'losing';
  if (slopePerWeek < 0.1) return 'stable';
  if (slopePerWeek < 0.5) return 'gaining';
  return 'gaining-fast';
}

export const PACE_LABEL: Record<Pace, string> = {
  'losing-fast': '急な減少ペース',
  losing: 'ゆるやかに減少中',
  stable: '安定しています',
  gaining: 'ゆるやかに増加中',
  'gaining-fast': '急な増加ペース',
};

export interface MetricWeekSummary {
  avg7: number | null;
  prevAvg7: number | null;
}

export function weekOverWeek(points: DailyPoint[], endISO = todayISO()): MetricWeekSummary {
  const last7 = lastDays(points, 7, endISO);
  const last14 = lastDays(points, 14, endISO);
  const prev7 = last14.filter((p) => !last7.includes(p));
  return { avg7: mean(last7.map((p) => p.value)), prevAvg7: mean(prev7.map((p) => p.value)) };
}

export interface ActivityWeightLink {
  /** best (largest |r|) correlation between daily steps and weight change, lag 0..7 days */
  r: number;
  lagDays: number;
  n: number;
}

/**
 * Correlate steps with day-over-day weight *change* rather than absolute
 * weight — absolute weight trends dominate and produce spurious correlations.
 */
export function stepsWeightLink(
  weight: DailyPoint[],
  steps: DailyPoint[],
): ActivityWeightLink | null {
  const deltas: DailyPoint[] = [];
  for (let i = 1; i < weight.length; i++) {
    deltas.push({ date: weight[i].date, value: weight[i].value - weight[i - 1].value });
  }
  let best: ActivityWeightLink | null = null;
  for (let lag = 0; lag <= 7; lag++) {
    const c = correlateDaily(deltas, steps, lag);
    if (c && c.n >= 14 && (!best || Math.abs(c.r) > Math.abs(best.r))) {
      best = { r: c.r, lagDays: lag, n: c.n };
    }
  }
  return best;
}

/** 7-day moving average, exported for chart overlays. */
export const smoothForChart = (points: DailyPoint[]) => movingAverage(points, 7);
