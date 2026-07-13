import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { stepsWeightLink } from '../insights';

/** 今日で終わる日次系列 */
const ending = (values: number[]): DailyPoint[] => {
  const today = todayISO();
  return values.map((v, i) => ({ date: addDays(today, -(values.length - 1 - i)), value: v }));
};

describe('stepsWeightLink', () => {
  /**
   * 体重は毎朝(その日歩く前)に計測するので、今朝の体重変化が反映しているのは
   * 前日の活動。ラグ0を許すと「今日これから歩く歩数」と「今朝すでに出ている体重変化」
   * を突き合わせることになり、逆因果(重かった日はあまり歩かなかった)を
   * 「よく歩いた0日後に体重が増加する傾向」として提示してしまう。
   */
  it('ラグ0(当日)は決して返さない', () => {
    // 同じ日の歩数と体重変化を完全一致させ、ラグ0の相関を最強(r=1)にする
    const deltas = [0.5, -0.5, 0.4, -0.4, 0.3, -0.3, 0.6, -0.6, 0.2, -0.2, 0.7, -0.7, 0.1, -0.1,
      0.45, -0.45, 0.35, -0.35, 0.55, -0.55, 0.25, -0.25];
    const weights: number[] = [70];
    for (const d of deltas) weights.push(weights[weights.length - 1] + d);
    // 歩数を「その日の体重変化」と同形にする = ラグ0で r=1.0 になる仕掛け
    const stepValues = [0, ...deltas].map((d) => 8000 + d * 10000);

    const link = stepsWeightLink(ending(weights), ending(stepValues), 10);
    expect(link).not.toBeNull();
    expect(link!.lagDays).toBeGreaterThanOrEqual(1);
  });

  it('翌朝に効く関係(ラグ1)を見つけられる', () => {
    // 「よく歩いた日の翌朝は体重が減る」を仕込む
    const deltas = [-0.4, 0.3, -0.5, 0.2, -0.3, 0.4, -0.6, 0.1, -0.2, 0.5, -0.45, 0.35,
      -0.55, 0.25, -0.35, 0.45, -0.25, 0.15, -0.5, 0.4];
    const weights: number[] = [70];
    for (const d of deltas) weights.push(weights[weights.length - 1] + d);
    // 歩数は「翌朝の体重変化」を決める前日の値なので、1日前にずらして置く
    const stepValues = [...deltas.map((d) => 8000 - d * 10000), 8000];

    const link = stepsWeightLink(ending(weights), ending(stepValues), 10);
    expect(link).not.toBeNull();
    expect(link!.lagDays).toBe(1);
    expect(link!.r).toBeLessThan(-0.9); // よく歩いた翌朝は体重が減る = 負の相関
  });

  it('ペア数が足りなければ何も返さない(偶然の相関を語らない)', () => {
    const weights = ending([70, 70.3, 69.9, 70.2, 70.0]);
    const steps = ending([6000, 12000, 5000, 9000, 7000]);
    expect(stepsWeightLink(weights, steps, 14)).toBeNull();
  });
});
