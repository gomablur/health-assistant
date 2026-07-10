import type { DailyPoint } from '@/health/types';
import { dayIndex } from '@/utils/date';

/**
 * Statistics over daily series. All functions are pure and tolerate gaps
 * (missing days are absent from the array, never zero-filled).
 */

/**
 * Trailing moving average over a calendar window: for each point, the mean of
 * all points dated within the `windowDays` days ending at that point. Using a
 * calendar window (not "last N points") keeps the smoothing honest when
 * measurements are skipped.
 */
export function movingAverage(points: DailyPoint[], windowDays: number): DailyPoint[] {
  const out: DailyPoint[] = [];
  let lo = 0;
  for (let i = 0; i < points.length; i++) {
    const end = dayIndex(points[i].date);
    while (dayIndex(points[lo].date) <= end - windowDays) lo++;
    let sum = 0;
    for (let j = lo; j <= i; j++) sum += points[j].value;
    out.push({ date: points[i].date, value: sum / (i - lo + 1) });
  }
  return out;
}

/**
 * Exponentially weighted moving average with a half-life in days. Gap-aware:
 * the decay applied between two measurements grows with the days elapsed.
 */
export function ewma(points: DailyPoint[], halfLifeDays: number): DailyPoint[] {
  if (points.length === 0) return [];
  const out: DailyPoint[] = [{ ...points[0] }];
  let prev = points[0].value;
  let prevDay = dayIndex(points[0].date);
  for (let i = 1; i < points.length; i++) {
    const day = dayIndex(points[i].date);
    const decay = Math.pow(0.5, (day - prevDay) / halfLifeDays);
    prev = decay * prev + (1 - decay) * points[i].value;
    prevDay = day;
    out.push({ date: points[i].date, value: prev });
  }
  return out;
}

export interface Trend {
  /** regression slope in value units per day */
  slopePerDay: number;
  slopePerWeek: number;
  /** coefficient of determination, 0..1 */
  r2: number;
  /** number of points used */
  n: number;
  /** fitted value at the last point's date */
  fittedEnd: number;
}

/** Ordinary least squares over (dayIndex, value). Returns null when under 3 points. */
export function linearTrend(points: DailyPoint[]): Trend | null {
  const n = points.length;
  if (n < 3) return null;
  const x0 = dayIndex(points[0].date);
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const p of points) {
    const x = dayIndex(p.date) - x0;
    sx += x;
    sy += p.value;
    sxx += x * x;
    sxy += x * p.value;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  let ssRes = 0,
    ssTot = 0;
  for (const p of points) {
    const x = dayIndex(p.date) - x0;
    const fit = intercept + slope * x;
    ssRes += (p.value - fit) ** 2;
    ssTot += (p.value - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const lastX = dayIndex(points[n - 1].date) - x0;
  return {
    slopePerDay: slope,
    slopePerWeek: slope * 7,
    r2,
    n,
    fittedEnd: intercept + slope * lastX,
  };
}

/** Pearson correlation coefficient. Returns null when under 3 pairs or zero variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n,
    my = sy / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface DailyCorrelation {
  r: number;
  n: number;
  lagDays: number;
}

/**
 * Correlate two daily series by date: pairs a[d + lagDays] with b[d]
 * (positive lag asks "does b predict a `lagDays` later?").
 */
export function correlateDaily(
  a: DailyPoint[],
  b: DailyPoint[],
  lagDays = 0,
): DailyCorrelation | null {
  const bByDate = new Map(b.map((p) => [dayIndex(p.date), p.value]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of a) {
    const match = bByDate.get(dayIndex(p.date) - lagDays);
    if (match !== undefined) {
      xs.push(p.value);
      ys.push(match);
    }
  }
  const r = pearson(xs, ys);
  return r === null ? null : { r, n: xs.length, lagDays };
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Points dated within the last `days` days ending at `endISO` (inclusive). */
export function lastDays(points: DailyPoint[], days: number, endISO: string): DailyPoint[] {
  const end = dayIndex(endISO);
  return points.filter((p) => {
    const d = dayIndex(p.date);
    return d > end - days && d <= end;
  });
}
