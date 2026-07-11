import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { correlateDaily, ewma, lastDays, linearTrend, mean, movingAverage } from './stats';

/** 体重画面とコーチの両方が使う、体重系列からの導出値。 */
export interface WeightInsight {
  latest: DailyPoint | null;
  /** ならした「本当の」体重(EWMA、半減期7日)の最新値 */
  trendWeight: number | null;
  /** 直近28日の計測に対する週あたり変化量(kg/週) */
  slopePerWeek: number | null;
  /** 28日線形フィットの説明力(決定係数)0..1 */
  trendR2: number | null;
  /** 直近7日 / その前7日の平均 */
  avg7: number | null;
  prevAvg7: number | null;
  /** 直近28日の計測継続率 0..1 */
  adherence28: number;
}

export function weightInsight(weight: DailyPoint[], endISO = todayISO()): WeightInsight {
  const latest = weight.length > 0 ? weight[weight.length - 1] : null;
  const smoothed = ewma(weight, 7);
  const trendWeight = smoothed.length > 0 ? smoothed[smoothed.length - 1].value : null;
  const last28 = lastDays(weight, 28, endISO);
  const trend = linearTrend(last28);
  const wow = weekOverWeek(weight, endISO);
  return {
    latest,
    trendWeight,
    slopePerWeek: trend?.slopePerWeek ?? null,
    trendR2: trend?.r2 ?? null,
    avg7: wow.avg7,
    prevAvg7: wow.prevAvg7,
    adherence28: last28.length / 28,
  };
}

/** 変化ペースの判定。一般に推奨される安全域(週±0.5kg)を境界に使う。 */
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

/** 直近7日平均と、その前の7日平均(前週比の表示用)。 */
export function weekOverWeek(points: DailyPoint[], endISO = todayISO()): MetricWeekSummary {
  return {
    avg7: mean(lastDays(points, 7, endISO).map((p) => p.value)),
    prevAvg7: mean(lastDays(points, 7, addDays(endISO, -7)).map((p) => p.value)),
  };
}

export interface ActivityWeightLink {
  /** 歩数と体重変化のうち |r| 最大の相関(ラグ0〜7日を走査) */
  r: number;
  lagDays: number;
  n: number;
}

/**
 * 歩数と相関させるのは体重の絶対値ではなく「前回計測からの変化量」。
 * 絶対値はトレンド自体に引きずられて見かけの相関が出てしまうため。
 * `minPairs` 未満のペア数しか揃わないラグは採用しない。
 */
export function stepsWeightLink(
  weight: DailyPoint[],
  steps: DailyPoint[],
  minPairs = 14,
): ActivityWeightLink | null {
  const deltas: DailyPoint[] = [];
  for (let i = 1; i < weight.length; i++) {
    deltas.push({ date: weight[i].date, value: weight[i].value - weight[i - 1].value });
  }
  let best: ActivityWeightLink | null = null;
  for (let lag = 0; lag <= 7; lag++) {
    const c = correlateDaily(deltas, steps, lag);
    if (c && c.n >= minPairs && (!best || Math.abs(c.r) > Math.abs(best.r))) {
      best = { r: c.r, lagDays: lag, n: c.n };
    }
  }
  return best;
}

/** チャートのオーバーレイ用の7日移動平均。 */
export const smoothForChart = (points: DailyPoint[]) => movingAverage(points, 7);
