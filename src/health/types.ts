/** Health data domain types, shared by all sources (HealthKit / Health Connect / Mock). */

export type MetricType =
  | 'weight' // kg, last measurement of the day
  | 'bodyFat' // %, last measurement of the day (0-100)
  | 'steps' // count, daily sum
  | 'restingHeartRate' // bpm, daily value
  | 'sleep' // hours, total per night (attributed to wake-up day)
  | 'activeEnergy' // kcal, daily sum
  | 'basalEnergy'; // kcal, daily sum (resting/basal energy burned)

/** One value for one local calendar day ('YYYY-MM-DD'). Missing days are absent, not zero. */
export interface DailyPoint {
  date: string;
  value: number;
}

export interface MetricMeta {
  label: string;
  unit: string;
  /** decimal places for display */
  digits: number;
}

export const METRICS: Record<MetricType, MetricMeta> = {
  weight: { label: '体重', unit: 'kg', digits: 1 },
  bodyFat: { label: '体脂肪率', unit: '%', digits: 1 },
  steps: { label: '歩数', unit: '歩', digits: 0 },
  restingHeartRate: { label: '安静時心拍', unit: 'bpm', digits: 0 },
  sleep: { label: '睡眠', unit: '時間', digits: 1 },
  activeEnergy: { label: 'アクティブカロリー', unit: 'kcal', digits: 0 },
  basalEnergy: { label: '基礎代謝', unit: 'kcal', digits: 0 },
};

export const ALL_METRICS = Object.keys(METRICS) as MetricType[];

export interface HealthDataSource {
  /** e.g. 'healthkit' | 'healthconnect' | 'mock' */
  readonly kind: string;
  isAvailable(): Promise<boolean>;
  /** Ask the OS for read permission. Resolves false when the user declined. */
  requestPermissions(metrics: MetricType[]): Promise<boolean>;
  /** Daily-aggregated values for [startDate, endDate] inclusive, sorted ascending. */
  queryDaily(metric: MetricType, startDate: string, endDate: string): Promise<DailyPoint[]>;
}
