import type { DailyPoint } from '@/health/types';
import { dayIndex } from '@/utils/date';

/**
 * 日次系列に対する統計関数。すべて純粋関数で、欠測に耐える
 * (未計測日は配列に存在しない。0埋めは絶対にしない)。
 */

/**
 * 暦日ウィンドウによる後方移動平均: 各点について、その点で終わる `windowDays`
 * 日以内に日付が入る点の平均。「直近N点」ではなく暦日で区切ることで、
 * 計測をサボった期間があってもならし方が歪まない。
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
 * 半減期(日)指定の指数加重移動平均。欠測対応:
 * 2つの計測の間に空いた日数に応じて減衰を大きくする。
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
  /** 回帰直線の傾き(値の単位/日) */
  slopePerDay: number;
  slopePerWeek: number;
  /** 決定係数 0..1 */
  r2: number;
  /** 使用した点の数 */
  n: number;
  /** 最終点の日付におけるフィット値 */
  fittedEnd: number;
}

/** (dayIndex, value) に対する最小二乗法。3点未満なら null。 */
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

/** ピアソン相関係数。3ペア未満、または分散ゼロなら null。 */
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
 * 2つの日次系列を日付で対応づけて相関を取る: a[d + lagDays] と b[d] をペアにする
 * (正のラグは「bは `lagDays` 日後のaを予測するか?」を問う)。
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

/** `endISO` で終わる直近 `days` 日(両端含む)に日付が入る点を返す。 */
export function lastDays(points: DailyPoint[], days: number, endISO: string): DailyPoint[] {
  const end = dayIndex(endISO);
  return points.filter((p) => {
    const d = dayIndex(p.date);
    return d > end - days && d <= end;
  });
}
