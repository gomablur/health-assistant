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

/** iOS実装(HealthKit)。native.ios.ts 経由でのみimportされる。 */

const QUANTITY_TYPES: Partial<Record<MetricType, QuantityTypeIdentifier>> = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  steps: 'HKQuantityTypeIdentifierStepCount',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  basalEnergy: 'HKQuantityTypeIdentifierBasalEnergyBurned',
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

/** ローカル時刻で [startISOの00:00, endISOの24:00) の範囲。 */
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

/** 体組成系メトリクス: 各ローカル日の最後の計測値を採用する。 */
async function queryDailyLastSample(
  identifier: QuantityTypeIdentifier,
  unit: string,
  startISO: string,
  endISO: string,
  scale = 1,
): Promise<DailyPoint[]> {
  const { startDate, endDate } = dateWindow(startISO, endISO);
  const samples = await queryQuantitySamples(identifier, {
    filter: { date: { startDate, endDate } },
    unit,
    ascending: true,
    limit: 0,
  });
  const byDay = new Map<string, number>();
  for (const s of samples) byDay.set(toISODate(new Date(s.endDate)), s.quantity * scale);
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function queryDailySleep(startISO: string, endISO: string): Promise<DailyPoint[]> {
  // 深夜0時前に始まる夜を取りこぼさないよう、1日前から取得する
  const { startDate, endDate } = dateWindow(addDays(startISO, -1), endISO);
  const samples = await queryCategorySamples(SLEEP_TYPE, {
    filter: { date: { startDate, endDate } },
    ascending: true,
    limit: 0,
  });
  // 起床日ごとに区間の和集合を取り、Watch + iPhone の二重計上を防ぐ
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
        return queryDailyLastSample(QUANTITY_TYPES.weight!, 'kg', startISO, endISO);
      case 'bodyFat':
        // HealthKitの体脂肪率は '%' 単位指定でも 0〜1 の割合で返る → ×100 が必要
        return queryDailyLastSample(QUANTITY_TYPES.bodyFat!, '%', startISO, endISO, 100);
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
      case 'basalEnergy':
        return queryDailyStatistics(
          QUANTITY_TYPES.basalEnergy!,
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
