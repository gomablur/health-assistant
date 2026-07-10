import type { DailyPoint } from '@/health/types';
import { todayISO } from '@/utils/date';
import { lastDays, mean } from './stats';

/**
 * Body-composition derivations and the daily intake guide, all computed from
 * OS health data (no user-entered profile needed).
 */

/** Fat mass (kg) = weight × body fat %, joined on days where both were measured. */
export function deriveFatMass(weight: DailyPoint[], bodyFatPct: DailyPoint[]): DailyPoint[] {
  const pctByDate = new Map(bodyFatPct.map((p) => [p.date, p.value]));
  const out: DailyPoint[] = [];
  for (const w of weight) {
    const pct = pctByDate.get(w.date);
    if (pct == null) continue;
    out.push({ date: w.date, value: Math.round(w.value * pct) / 100 }); // kg, 2 decimals
  }
  return out;
}

export interface IntakeGuide {
  /** estimated total daily energy expenditure (kcal/day), 7-day averages */
  tdee: number;
  basalAvg: number;
  activeAvg: number;
  /** intake targets by weight-change pace (kcal/day) */
  maintain: number;
  loseQuarterKgPerWeek: number;
  loseHalfKgPerWeek: number;
  /** how many of the last 7 days actually had basal data */
  basalDays: number;
}

/** ~7700 kcal per kg of body fat → 0.25kg/week ≈ 275 kcal/day deficit. */
const KCAL_PER_KG = 7700;
const DEFICIT_QUARTER = Math.round((0.25 * KCAL_PER_KG) / 7); // 275
const DEFICIT_HALF = Math.round((0.5 * KCAL_PER_KG) / 7); // 550

/**
 * Intake guide from measured expenditure. Returns null without basal data —
 * we only estimate from what the OS actually recorded, no formula guessing.
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
