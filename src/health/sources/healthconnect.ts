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

/** Android実装(Health Connect)。native.android.ts 経由でのみimportされる。 */

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
 * Android 13以前では Health Connect はOS同梱ではなくPlayストアの別アプリ。
 * 未インストールのまま権限リクエストすると解決不能なintentでクラッシュするため、
 * 先に利用可否を確認する必要がある。
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

/**
 * レコード列をローカル日付ごとに1値へ畳み込む。
 * - 'last': その日の最後のレコードを採用(体重など、日に数回計測しうる体組成系)
 * - 'sum':  多数レコードに分割された加算量(歩数・消費カロリー)
 * - 'mean': レート系の読み値。その日の平均を採用(bpm、kcal/日)
 */
function aggregateByDay<T>(
  records: T[],
  dayOf: (r: T) => string,
  valueOf: (r: T) => number,
  mode: 'last' | 'sum' | 'mean',
): DailyPoint[] {
  const acc = new Map<string, { total: number; n: number }>();
  for (const r of records) {
    const day = dayOf(r);
    const v = valueOf(r);
    const cur = acc.get(day);
    if (mode === 'last' || !cur) acc.set(day, { total: v, n: 1 });
    else acc.set(day, { total: cur.total + v, n: cur.n + 1 });
  }
  const byDay = new Map<string, number>();
  for (const [day, { total, n }] of acc) byDay.set(day, mode === 'mean' ? total / n : total);
  return toSortedPoints(byDay);
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
    const day = (time: string) => toISODate(new Date(time));
    switch (metric) {
      case 'weight': {
        const records = await readAll('Weight', startISO, endISO);
        return aggregateByDay(records, (r) => day(r.time), (r) => r.weight.inKilograms, 'last');
      }
      case 'bodyFat': {
        const records = await readAll('BodyFat', startISO, endISO);
        return aggregateByDay(records, (r) => day(r.time), (r) => r.percentage, 'last');
      }
      case 'steps': {
        const records = await readAll('Steps', startISO, endISO);
        return aggregateByDay(records, (r) => day(r.startTime), (r) => r.count, 'sum');
      }
      case 'activeEnergy': {
        const records = await readAll('ActiveCaloriesBurned', startISO, endISO);
        return aggregateByDay(
          records,
          (r) => day(r.startTime),
          (r) => r.energy.inKilocalories,
          'sum',
        );
      }
      case 'basalEnergy': {
        // BMRの読み値は kcal/日 のレート。その日の基礎消費 ≈ その日の平均レートとみなす
        const records = await readAll('BasalMetabolicRate', startISO, endISO);
        return aggregateByDay(
          records,
          (r) => day(r.time),
          (r) => r.basalMetabolicRate.inKilocaloriesPerDay,
          'mean',
        );
      }
      case 'restingHeartRate': {
        const records = await readAll('RestingHeartRate', startISO, endISO);
        return aggregateByDay(records, (r) => day(r.time), (r) => r.beatsPerMinute, 'mean');
      }
      case 'sleep': {
        // 前夜から始まるセッションは翌朝(起床日)に帰属させる
        const records = await readAll('SleepSession', addDays(startISO, -1), endISO);
        const byDay = new Map<string, TimeInterval[]>();
        for (const r of records) {
          const end = new Date(r.endTime);
          const wakeDay = toISODate(end);
          if (wakeDay < startISO || wakeDay > endISO) continue;
          const list = byDay.get(wakeDay) ?? [];
          list.push({ start: new Date(r.startTime).getTime(), end: end.getTime() });
          byDay.set(wakeDay, list);
        }
        return [...byDay.entries()]
          .map(([date, intervals]) => ({ date, value: unionHours(intervals) }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  },
};
