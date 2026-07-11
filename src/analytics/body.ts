import type { DailyPoint } from '@/health/types';
import { todayISO } from '@/utils/date';
import { lastDays, mean } from './stats';

/**
 * 体組成の導出値と1日の摂取カロリー目安。すべてOSのヘルスデータから計算する
 * (ユーザーにプロフィール入力をさせない方針)。
 */

/** 体脂肪量(kg) = 体重 × 体脂肪率。両方を計測した日だけ算出する。 */
export function deriveFatMass(weight: DailyPoint[], bodyFatPct: DailyPoint[]): DailyPoint[] {
  const pctByDate = new Map(bodyFatPct.map((p) => [p.date, p.value]));
  const out: DailyPoint[] = [];
  for (const w of weight) {
    const pct = pctByDate.get(w.date);
    if (pct == null) continue;
    out.push({ date: w.date, value: Math.round(w.value * pct) / 100 }); // kg、小数2桁
  }
  return out;
}

export interface IntakeGuide {
  /** 推定総消費エネルギー(kcal/日)。7日平均から算出 */
  tdee: number;
  basalAvg: number;
  activeAvg: number;
  /** 減量ペース別の摂取目安(kcal/日) */
  maintain: number;
  loseQuarterKgPerWeek: number;
  loseHalfKgPerWeek: number;
  /** 直近7日のうち基礎代謝データが実際にあった日数 */
  basalDays: number;
}

/** 体脂肪1kg ≈ 7700kcal → 週0.25kg減 ≈ 1日275kcalの赤字。 */
const KCAL_PER_KG = 7700;
const DEFICIT_QUARTER = Math.round((0.25 * KCAL_PER_KG) / 7); // 275
const DEFICIT_HALF = Math.round((0.5 * KCAL_PER_KG) / 7); // 550

/**
 * 実測の消費エネルギーから摂取目安を出す。基礎代謝データがなければ null —
 * OSが実際に記録した値だけから推定し、推定式による当てずっぽうはしない。
 */
export function intakeGuide(
  basalEnergy: DailyPoint[],
  activeEnergy: DailyPoint[],
  endISO = todayISO(),
): IntakeGuide | null {
  const basal7 = lastDays(basalEnergy, 7, endISO);
  const active7 = lastDays(activeEnergy, 7, endISO);
  const basalAvg = mean(basal7.map((p) => p.value));
  const activeAvg = mean(active7.map((p) => p.value)) ?? 0;
  if (basalAvg == null || basal7.length < 3) return null;

  const tdee = Math.round(basalAvg + activeAvg);
  return {
    tdee,
    basalAvg: Math.round(basalAvg),
    activeAvg: Math.round(activeAvg),
    maintain: tdee,
    loseQuarterKgPerWeek: tdee - DEFICIT_QUARTER,
    loseHalfKgPerWeek: tdee - DEFICIT_HALF,
    basalDays: basal7.length,
  };
}
