import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
  type ObjectTypeIdentifier,
  type QuantityTypeIdentifier,
} from '@kingstinct/react-native-healthkit';

import { addDays, fromISODate, toISODate } from '@/utils/date';
import type { DailyPoint, HealthDataSource, MetricType } from '../types';
import { unionHours, type TimeInterval } from './intervals';

/** iOS implementation backed by HealthKit. Only ever imported via native.ios.ts. */

const QUANTITY_TYPES: Partial<Record<MetricType, QuantityTypeIdentifier>> = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  steps: 'HKQuantityTypeIdentifierStepCount',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
};

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis' as const;

const ASLEEP_VALUES = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

function readTypeFor(metric: MetricType): ObjectTypeIdentifier {
  return metric === 'sleep' ? SLEEP_TYPE : QUANTITY_TYPES[metric]!;
}

/** [00:00 of startISO, 24:00 of endISO) in local time. */
function dateWindow(startISO: string, endISO: string) {
  return { startDate: fromISODate(startISO), endDate: fromISODate(addDays(endISO, 1)) };
}

async function queryDailyStatistics(
  identifier: QuantityTypeIdentifier,
  kind: 'sum' | 'average',
  unit: string,
  startISO: string,
  endISO: string,
): Promise<DailyPoint[]> {
  const { startDate, endDate } = dateWindow(startISO, endISO);
  const stats = await queryStatisticsCollectionForQuantity(
    identifier,
    [kind === 'sum' ? 'cumulativeSum' : 'discreteAverage'],
    startDate,
    { day: 1 },
    { filter: { date: { startDate, endDate } }, unit },
  );
  const points: DailyPoint[] = [];
  for (const s of stats) {
    const q = kind === 'sum' ? s.sumQuantity : s.averageQuantity;
    if (!q || !s.startDate) continue;
    points.push({ date: toISODate(new Date(s.startDate)), value: q.quantity });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

async function queryDailyWeight(startISO: string, endISO: string): Promise<DailyPoint[]> {
  const { startDate, endDate } = dateWindow(startISO, endISO);
  const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
    filter: { date: { startDate, endDate } },
    unit: 'kg',
    ascending: true,
    limit: 0,
  });
  // last measurement wins for each local day
  const byDay = new Map<string, number>();
  for (const s of samples) byDay.set(toISODate(new Date(s.endDate)), s.quantity);
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function queryDailySleep(startISO: string, endISO: string): Promise<DailyPoint[]> {
  // start a day early so a night beginning before midnight is fully captured
  const { startDate, endDate } = dateWindow(addDays(startISO, -1), endISO);
  const samples = await queryCategorySamples(SLEEP_TYPE, {
    filter: { date: { startDate, endDate } },
    ascending: true,
    limit: 0,
  });
  // union per wake-up day to avoid double counting Watch + iPhone records
  const byDay = new Map<string, TimeInterval[]>();
  for (const s of samples) {
    if (!ASLEEP_VALUES.has(s.value as number)) continue;
    const end = new Date(s.endDate);
    const day = toISODate(end);
    if (day < startISO || day > endISO) continue;
    const list = byDay.get(day) ?? [];
    list.push({ start: new Date(s.startDate).getTime(), end: end.getTime() });
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .map(([date, intervals]) => ({ date, value: unionHours(intervals) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const healthKitSource: HealthDataSource = {
  kind: 'healthkit',
  isAvailable: () => isHealthDataAvailableAsync(),
  async requestPermissions(metrics) {
    return requestAuthorization({ toRead: metrics.map(readTypeFor) });
  },
  async queryDaily(metric, startISO, endISO) {
    switch (metric) {
      case 'weight':
        return queryDailyWeight(startISO, endISO);
      case 'sleep':
        return queryDailySleep(startISO, endISO);
      case 'steps':
        return queryDailyStatistics(
          QUANTITY_TYPES.steps!,
          'sum',
          'count',
          startISO,
          endISO,
        );
      case 'activeEnergy':
        return queryDailyStatistics(
          QUANTITY_TYPES.activeEnergy!,
          'sum',
          'kcal',
          startISO,
          endISO,
        );
      case 'restingHeartRate':
        return queryDailyStatistics(
          QUANTITY_TYPES.restingHeartRate!,
          'average',
          'count/min',
          startISO,
          endISO,
        );
    }
  },
};
