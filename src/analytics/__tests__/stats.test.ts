import type { DailyPoint } from '@/health/types';
import {
  correlateDaily,
  ewma,
  lastDays,
  linearTrend,
  mean,
  movingAverage,
  pearson,
} from '../stats';

const pts = (entries: [string, number][]): DailyPoint[] =>
  entries.map(([date, value]) => ({ date, value }));

describe('movingAverage', () => {
  it('点数ではなく暦日ウィンドウで平均する', () => {
    // 01-02と01-05の間に欠測: ウィンドウ外の日は平均から落ちること
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-02', 72],
      ['2026-01-05', 74],
    ]);
    const ma = movingAverage(series, 3);
    expect(ma[0].value).toBe(70);
    expect(ma[1].value).toBe(71); // (70+72)/2
    expect(ma[2].value).toBe(74); // 01-03..01-05 のウィンドウに含まれるのは01-05のみ
  });

  it('ウィンドウが全体を覆うなら単純平均と一致する', () => {
    const series = pts([
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-03', 6],
    ]);
    expect(movingAverage(series, 30)[2].value).toBeCloseTo(3);
  });
});

describe('ewma', () => {
  it('最初の値から始まり、新しい値の方向へ動く', () => {
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-02', 71],
    ]);
    const out = ewma(series, 7);
    expect(out[0].value).toBe(70);
    expect(out[1].value).toBeGreaterThan(70);
    expect(out[1].value).toBeLessThan(71);
  });

  it('半減期ぶんの間隔が空くと半分まで減衰する', () => {
    const series = pts([
      ['2026-01-01', 100],
      ['2026-01-08', 0], // 7日後、半減期7日
    ]);
    expect(ewma(series, 7)[1].value).toBeCloseTo(50);
  });
});

describe('linearTrend', () => {
  it('完全な直線の傾きを復元する', () => {
    const series = pts([
      ['2026-01-01', 70.0],
      ['2026-01-02', 69.9],
      ['2026-01-03', 69.8],
      ['2026-01-04', 69.7],
    ]);
    const t = linearTrend(series)!;
    expect(t.slopePerDay).toBeCloseTo(-0.1);
    expect(t.slopePerWeek).toBeCloseTo(-0.7);
    expect(t.r2).toBeCloseTo(1);
    expect(t.fittedEnd).toBeCloseTo(69.7);
  });

  it('欠測があっても暦日ベースで回帰する', () => {
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-11', 71], // 10日で+1kg = 0.1/日
      ['2026-01-21', 72],
    ]);
    expect(linearTrend(series)!.slopePerDay).toBeCloseTo(0.1);
  });

  it('3点未満ならnullを返す', () => {
    expect(linearTrend(pts([['2026-01-01', 70], ['2026-01-02', 71]]))).toBeNull();
  });
});

describe('pearson / correlateDaily', () => {
  it('完全な正・負の相関を検出する', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
  });

  it('分散ゼロならnullを返す', () => {
    expect(pearson([1, 1, 1], [2, 4, 6])).toBeNull();
  });

  it('日付で対応づけ、ラグを適用する', () => {
    const a = pts([
      ['2026-01-02', 10],
      ['2026-01-03', 20],
      ['2026-01-04', 30],
      ['2026-01-05', 40],
    ]);
    const b = pts([
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-03', 3],
      ['2026-01-04', 4],
    ]);
    // ラグ1では a[d] と b[d-1] がペアになる → 完全相関
    const c = correlateDaily(a, b, 1)!;
    expect(c.r).toBeCloseTo(1);
    expect(c.n).toBe(4);
  });

  it('相手のいない日付はスキップする', () => {
    const a = pts([
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-03', 3],
      ['2026-01-09', 9],
    ]);
    const b = pts([
      ['2026-01-01', 2],
      ['2026-01-02', 4],
      ['2026-01-03', 6],
    ]);
    expect(correlateDaily(a, b, 0)!.n).toBe(3);
  });
});

describe('helpers', () => {
  it('空配列のmeanはnull', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });

  it('lastDaysは末尾からの両端含むウィンドウを取る', () => {
    const series = pts([
      ['2026-01-01', 1],
      ['2026-01-05', 5],
      ['2026-01-07', 7],
    ]);
    const window = lastDays(series, 3, '2026-01-07'); // 01-05..01-07 の3日間
    expect(window.map((p) => p.value)).toEqual([5, 7]);
  });
});
