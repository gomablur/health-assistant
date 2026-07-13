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
  /** 歩数と体重変化のうち |r| 最大の相関(ラグ1〜7日を走査) */
  r: number;
  /** 歩数の何日後の体重変化と相関したか。最小は1(理由は下記) */
  lagDays: number;
  n: number;
}

/** 走査するラグの下限。0にしてはいけない(理由は stepsWeightLink のコメント)。 */
const MIN_LAG_DAYS = 1;
const MAX_LAG_DAYS = 7;

/**
 * 歩数と相関させるのは体重の絶対値ではなく「前回計測からの変化量」。
 * 絶対値はトレンド自体に引きずられて見かけの相関が出てしまうため。
 * `minPairs` 未満のペア数しか揃わないラグは採用しない。
 *
 * **ラグは1日以上しか見ない。** 体重は毎朝(その日歩く前)に計測するので、今朝の
 * 体重変化が反映しているのは前日の活動である。ラグ0は「今日これから歩く歩数」と
 * 「今朝すでに出ている体重変化」を突き合わせることになり、因果として成立しない。
 * 実際これを許すと「よく歩いた0日後に体重が増加する傾向」という逆因果
 * (=重かった日はあまり歩かなかった、の裏返し)を最大相関として拾ってしまう。
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
  for (let lag = MIN_LAG_DAYS; lag <= MAX_LAG_DAYS; lag++) {
    const c = correlateDaily(deltas, steps, lag);
    if (c && c.n >= minPairs && (!best || Math.abs(c.r) > Math.abs(best.r))) {
      best = { r: c.r, lagDays: lag, n: c.n };
    }
  }
  return best;
}

/** チャートのオーバーレイ用の7日移動平均。 */
export const smoothForChart = (points: DailyPoint[]) => movingAverage(points, 7);
