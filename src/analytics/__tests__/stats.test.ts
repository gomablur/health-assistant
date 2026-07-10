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
  it('averages over a calendar window, not a point count', () => {
    // gap between 01-02 and 01-05: the window must drop out-of-range days
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-02', 72],
      ['2026-01-05', 74],
    ]);
    const ma = movingAverage(series, 3);
    expect(ma[0].value).toBe(70);
    expect(ma[1].value).toBe(71); // (70+72)/2
    expect(ma[2].value).toBe(74); // 01-03..01-05 window contains only 01-05
  });

  it('equals the plain mean when the window covers everything', () => {
    const series = pts([
      ['2026-01-01', 1],
      ['2026-01-02', 2],
      ['2026-01-03', 6],
    ]);
    expect(movingAverage(series, 30)[2].value).toBeCloseTo(3);
  });
});

describe('ewma', () => {
  it('starts at the first value and moves toward new values', () => {
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-02', 71],
    ]);
    const out = ewma(series, 7);
    expect(out[0].value).toBe(70);
    expect(out[1].value).toBeGreaterThan(70);
    expect(out[1].value).toBeLessThan(71);
  });

  it('decays by half after one half-life gap', () => {
    const series = pts([
      ['2026-01-01', 100],
      ['2026-01-08', 0], // 7 days later, half-life 7
    ]);
    expect(ewma(series, 7)[1].value).toBeCloseTo(50);
  });
});

describe('linearTrend', () => {
  it('recovers a perfect linear slope', () => {
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

  it('handles gaps by regressing on calendar days', () => {
    const series = pts([
      ['2026-01-01', 70],
      ['2026-01-11', 71], // +1kg over 10 days = 0.1/day
      ['2026-01-21', 72],
    ]);
    expect(linearTrend(series)!.slopePerDay).toBeCloseTo(0.1);
  });

  it('returns null when under 3 points', () => {
    expect(linearTrend(pts([['2026-01-01', 70], ['2026-01-02', 71]]))).toBeNull();
  });
});

describe('pearson / correlateDaily', () => {
  it('finds perfect positive and negative correlation', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
  });

  it('returns null on zero variance', () => {
    expect(pearson([1, 1, 1], [2, 4, 6])).toBeNull();
  });

  it('aligns by date and applies lag', () => {
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
    // with lag 1, a[d] pairs with b[d-1] → perfectly correlated
    const c = correlateDaily(a, b, 1)!;
    expect(c.r).toBeCloseTo(1);
    expect(c.n).toBe(4);
  });

  it('skips dates with no partner', () => {
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
  it('mean of empty is null', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });

  it('lastDays takes a trailing inclusive window', () => {
    const series = pts([
      ['2026-01-01', 1],
      ['2026-01-05', 5],
      ['2026-01-07', 7],
    ]);
    const window = lastDays(series, 3, '2026-01-07'); // 01-05..01-07
    expect(window.map((p) => p.value)).toEqual([5, 7]);
  });
});
