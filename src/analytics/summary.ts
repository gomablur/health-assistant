import type { DailyPoint, MetricType } from '@/health/types';
import { todayISO } from '@/utils/date';
import { assessPace, PACE_LABEL, stepsWeightLink, weekOverWeek, weightInsight } from './insights';

export type MetricSeries = Partial<Record<MetricType, DailyPoint[]>>;

/**
 * Aggregate the numbers the AI coach needs. Only statistics leave the device —
 * never the raw day-by-day samples.
 */
export interface CoachSummary {
  date: string;
  weight: {
    latest: number | null;
    trend: number | null;
    slopePerWeekKg: number | null;
    paceLabel: string | null;
    avg7: number | null;
    prevAvg7: number | null;
    adherencePct: number;
  };
  steps: { avg7: number | null; prevAvg7: number | null };
  sleep: { avg7: number | null; prevAvg7: number | null };
  restingHeartRate: { avg7: number | null; prevAvg7: number | null };
  activeEnergy: { avg7: number | null; prevAvg7: number | null };
  stepsWeightCorrelation: { r: number; lagDays: number; n: number } | null;
}

const round = (v: number | null, digits: number) =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export function buildCoachSummary(series: MetricSeries, endISO = todayISO()): CoachSummary {
  const w = weightInsight(series.weight ?? [], endISO);
  const wow = (m: MetricType) => {
    const s = weekOverWeek(series[m] ?? [], endISO);
    return { avg7: round(s.avg7, 1), prevAvg7: round(s.prevAvg7, 1) };
  };
  const link =
    series.weight && series.steps ? stepsWeightLink(series.weight, series.steps) : null;

  return {
    date: endISO,
    weight: {
      latest: w.latest?.value ?? null,
      trend: round(w.trendWeight, 2),
      slopePerWeekKg: round(w.slopePerWeek, 2),
      paceLabel: w.slopePerWeek == null ? null : PACE_LABEL[assessPace(w.slopePerWeek)],
      avg7: round(w.avg7, 2),
      prevAvg7: round(w.prevAvg7, 2),
      adherencePct: Math.round(w.adherence28 * 100),
    },
    steps: wow('steps'),
    sleep: wow('sleep'),
    restingHeartRate: wow('restingHeartRate'),
    activeEnergy: wow('activeEnergy'),
    stepsWeightCorrelation: link
      ? { r: round(link.r, 2)!, lagDays: link.lagDays, n: link.n }
      : null,
  };
}
