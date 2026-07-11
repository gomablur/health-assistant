import {
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type ReadRecordsOptions,
  type RecordType,
} from 'react-native-health-connect';

import { addDays, fromISODate, toISODate } from '@/utils/date';
import type { DailyPoint, HealthDataSource, MetricType } from '../types';
import { unionHours, type TimeInterval } from './intervals';

/** Android implementation backed by Health Connect. Only imported via native.android.ts. */

const RECORD_TYPES: Record<MetricType, RecordType> = {
  weight: 'Weight',
  bodyFat: 'BodyFat',
  steps: 'Steps',
  restingHeartRate: 'RestingHeartRate',
  sleep: 'SleepSession',
  activeEnergy: 'ActiveCaloriesBurned',
  basalEnergy: 'BasalMetabolicRate',
};

let initPromise: Promise<boolean> | null = null;

function ensureInitialized(): Promise<boolean> {
  initPromise ??= initialize().catch(() => false);
  return initPromise;
}

/**
 * On Android 13 and below Health Connect is a separate Play Store app, not
 * part of the OS. Requesting permissions while it is missing crashes with an
 * unresolvable intent, so availability must be checked first.
 */
async function sdkStatus(): Promise<number> {
  try {
    return await getSdkStatus();
  } catch {
    return SdkAvailabilityStatus.SDK_UNAVAILABLE;
  }
}

async function readAll<T extends RecordType>(recordType: T, startISO: string, endISO: string) {
  const timeRangeFilter: ReadRecordsOptions['timeRangeFilter'] = {
    operator: 'between',
    startTime: fromISODate(startISO).toISOString(),
    endTime: fromISODate(addDays(endISO, 1)).toISOString(),
  };
  const records = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords(recordType, { timeRangeFilter, pageToken });
    records.push(...res.records);
    pageToken = res.pageToken || undefined;
  } while (pageToken);
  return records;
}

function toSortedPoints(byDay: Map<string, number>): DailyPoint[] {
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const healthConnectSource: HealthDataSource = {
  kind: 'healthconnect',
  async isAvailable() {
    return (await sdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && ensureInitialized();
  },
  async requestPermissions(metrics) {
    const status = await sdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      throw new Error(
        'ヘルスコネクトアプリの更新が必要です。Playストアで「ヘルスコネクト」を更新してください。',
      );
    }
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      throw new Error(
        'この端末ではヘルスコネクトが見つかりません。Android 13以前では、Playストアから「ヘルスコネクト (Health Connect)」アプリのインストールが必要です。',
      );
    }
    if (!(await ensureInitialized())) return false;
    const wanted: Permission[] = metrics.map((m) => ({
      accessType: 'read',
      recordType: RECORD_TYPES[m],
    }));
    try {
      const granted = await requestPermission(wanted);
      return granted.length > 0;
    } catch (e) {
      throw new Error(
        `権限のリクエストに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
  async queryDaily(metric, startISO, endISO) {
    if (!(await ensureInitialized())) return [];
    switch (metric) {
      case 'weight': {
        const records = await readAll('Weight', startISO, endISO);
        const byDay = new Map<string, number>();
        for (const r of records) byDay.set(toISODate(new Date(r.time)), r.weight.inKilograms);
        return toSortedPoints(byDay);
      }
      case 'steps': {
        const records = await readAll('Steps', startISO, endISO);
        const byDay = new Map<string, number>();
        for (const r of records) {
          const day = toISODate(new Date(r.startTime));
          byDay.set(day, (byDay.get(day) ?? 0) + r.count);
        }
        return toSortedPoints(byDay);
      }
      case 'activeEnergy': {
        const records = await readAll('ActiveCaloriesBurned', startISO, endISO);
        const byDay = new Map<string, number>();
        for (const r of records) {
          const day = toISODate(new Date(r.startTime));
          byDay.set(day, (byDay.get(day) ?? 0) + r.energy.inKilocalories);
        }
        return toSortedPoints(byDay);
      }
      case 'bodyFat': {
        const records = await readAll('BodyFat', startISO, endISO);
        const byDay = new Map<string, number>();
        for (const r of records) byDay.set(toISODate(new Date(r.time)), r.percentage);
        return toSortedPoints(byDay);
      }
      case 'basalEnergy': {
        // BMR readings are kcal/day rates; a day's basal burn ≈ that day's mean rate
        const records = await readAll('BasalMetabolicRate', startISO, endISO);
        const sums = new Map<string, { total: number; n: number }>();
        for (const r of records) {
          const day = toISODate(new Date(r.time));
          const cur = sums.get(day) ?? { total: 0, n: 0 };
          sums.set(day, {
            total: cur.total + r.basalMetabolicRate.inKilocaloriesPerDay,
            n: cur.n + 1,
          });
        }
        const byDay = new Map<string, number>();
        for (const [day, { total, n }] of sums) byDay.set(day, total / n);
        return toSortedPoints(byDay);
      }
      case 'restingHeartRate': {
        const records = await readAll('RestingHeartRate', startISO, endISO);
        const sums = new Map<string, { total: number; n: number }>();
        for (const r of records) {
          const day = toISODate(new Date(r.time));
          const cur = sums.get(day) ?? { total: 0, n: 0 };
          sums.set(day, { total: cur.total + r.beatsPerMinute, n: cur.n + 1 });
        }
        const byDay = new Map<string, number>();
        for (const [day, { total, n }] of sums) byDay.set(day, total / n);
        return toSortedPoints(byDay);
      }
      case 'sleep': {
        // sessions starting the previous evening belong to the next wake-up day
        const records = await readAll('SleepSession', addDays(startISO, -1), endISO);
        const byDay = new Map<string, TimeInterval[]>();
        for (const r of records) {
          const end = new Date(r.endTime);
          const day = toISODate(end);
          if (day < startISO || day > endISO) continue;
          const list = byDay.get(day) ?? [];
          list.push({ start: new Date(r.startTime).getTime(), end: end.getTime() });
          byDay.set(day, list);
        }
        return [...byDay.entries()]
          .map(([date, intervals]) => ({ date, value: unionHours(intervals) }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  },
};
