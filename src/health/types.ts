/** ヘルスデータのドメイン型。全ソース(HealthKit / Health Connect / モック)で共有。 */

export type MetricType =
  | 'weight' // kg、その日の最後の計測値
  | 'bodyFat' // %、その日の最後の計測値(0-100)
  | 'steps' // 歩、日次合計
  | 'restingHeartRate' // bpm、日次値
  | 'sleep' // 時間、一晩の合計(起床日に帰属)
  | 'activeEnergy' // kcal、日次合計
  | 'basalEnergy'; // kcal、日次合計(基礎代謝による消費)

/** ローカル暦日('YYYY-MM-DD')1日ぶんの値。未計測日は要素ごと存在しない(0ではない)。 */
export interface DailyPoint {
  date: string;
  value: number;
}

export interface MetricMeta {
  label: string;
  unit: string;
  /** 表示時の小数桁数 */
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
  /** 'healthkit' | 'healthconnect' | 'mock' など */
  readonly kind: string;
  isAvailable(): Promise<boolean>;
  /** OSに読み取り権限を要求する。ユーザーが拒否した場合は false を返す。 */
  requestPermissions(metrics: MetricType[]): Promise<boolean>;
  /** [startDate, endDate](両端含む)の日次集計値を日付昇順で返す。 */
  queryDaily(metric: MetricType, startDate: string, endDate: string): Promise<DailyPoint[]>;
}
