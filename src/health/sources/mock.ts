import { addDays, dayIndex, fromISODate, todayISO } from '@/utils/date';
import type { DailyPoint, HealthDataSource, MetricType } from '../types';

/**
 * Deterministic mock data for development in environments without HealthKit /
 * Health Connect (web preview, Expo Go, simulators). Generates a year of
 * plausible data: weight drifts slowly with weekend bumps and skipped days,
 * steps follow a weekday pattern, sleep and heart rate stay in realistic bands.
 */

/** mulberry32 — small seeded PRNG so every reload shows the same data. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approx standard normal via sum of uniforms. */
function gauss(rand: () => number): number {
  return rand() + rand() + rand() + rand() + rand() + rand() - 3;
}

const HISTORY_DAYS = 400;

function generate(metric: MetricType): DailyPoint[] {
  const rand = rng(metric.length * 7919 + metric.charCodeAt(0));
  const end = todayISO();
  const start = addDays(end, -(HISTORY_DAYS - 1));
  const points: DailyPoint[] = [];

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = addDays(start, i);
    const dow = fromISODate(date).getDay(); // 0 = Sun
    const t = dayIndex(date);
    const seasonal = Math.sin((t % 365) / 365 * 2 * Math.PI);

    let value: number | null = null;
    switch (metric) {
      case 'weight': {
        if (rand() < 0.08) break; // skipped a morning
        const drift = -0.0015 * i; // slow loss over the year
        const weekend = dow === 0 || dow === 1 ? 0.25 : 0; // Sun/Mon after weekend
        value = 72.4 + drift + 0.5 * seasonal + weekend + 0.35 * gauss(rand);
        value = Math.round(value * 10) / 10;
        break;
      }
      case 'steps': {
        const base = dow === 0 ? 5200 : dow === 6 ? 9800 : 7600;
        value = Math.max(1200, Math.round(base * (1 + 0.35 * gauss(rand))));
        if (rand() < 0.03) value += 8000; // occasional long walk
        break;
      }
      case 'restingHeartRate': {
        value = Math.round(57 + 2 * seasonal + 1.6 * gauss(rand));
        break;
      }
      case 'sleep': {
        const base = dow === 6 || dow === 0 ? 7.7 : 6.7; // longer on weekend nights
        value = Math.round(Math.min(10, Math.max(4, base + 0.6 * gauss(rand))) * 10) / 10;
        break;
      }
      case 'activeEnergy': {
        const stepsProxy = dow === 0 ? 5200 : dow === 6 ? 9800 : 7600;
        value = Math.max(80, Math.round(180 + stepsProxy * 0.045 * (1 + 0.3 * gauss(rand))));
        break;
      }
    }
    if (value != null) points.push({ date, value });
  }
  return points;
}

const cache = new Map<MetricType, DailyPoint[]>();

export const mockSource: HealthDataSource = {
  kind: 'mock',
  async isAvailable() {
    return true;
  },
  async requestPermissions() {
    return true;
  },
  async queryDaily(metric, startDate, endDate) {
    let all = cache.get(metric);
    if (!all) {
      all = generate(metric);
      cache.set(metric, all);
    }
    return all.filter((p) => p.date >= startDate && p.date <= endDate);
  },
};
