import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { deriveFatMass, intakeGuide } from '../body';

const pts = (entries: [string, number][]): DailyPoint[] =>
  entries.map(([date, value]) => ({ date, value }));

describe('deriveFatMass', () => {
  it('multiplies weight by percentage on matching days only', () => {
    const weight = pts([
      ['2026-01-01', 70],
      ['2026-01-02', 71],
      ['2026-01-03', 72],
    ]);
    const bf = pts([
      ['2026-01-01', 20],
      ['2026-01-03', 25],
    ]);
    const fat = deriveFatMass(weight, bf);
    expect(fat).toEqual([
      { date: '2026-01-01', value: 14 },
      { date: '2026-01-03', value: 18 },
    ]);
  });

  it('is empty when nothing overlaps', () => {
    expect(deriveFatMass(pts([['2026-01-01', 70]]), pts([['2026-01-02', 20]]))).toEqual([]);
  });
});

describe('intakeGuide', () => {
  const today = todayISO();
  const daily = (days: number, value: number): DailyPoint[] =>
    Array.from({ length: days }, (_, i) => ({ date: addDays(today, -i), value }));

  it('sums basal and active 7-day averages into TDEE and targets', () => {
    const guide = intakeGuide(daily(7, 1500), daily(7, 400))!;
    expect(guide.tdee).toBe(1900);
    expect(guide.maintain).toBe(1900);
    expect(guide.loseQuarterKgPerWeek).toBe(1900 - 275);
    expect(guide.loseHalfKgPerWeek).toBe(1900 - 550);
    expect(guide.basalDays).toBe(7);
  });

  it('works without any active energy', () => {
    const guide = intakeGuide(daily(7, 1500), [])!;
    expect(guide.tdee).toBe(1500);
    expect(guide.activeAvg).toBe(0);
  });

  it('returns null with too little basal data', () => {
    expect(intakeGuide(daily(2, 1500), daily(7, 400))).toBeNull();
    expect(intakeGuide([], daily(7, 400))).toBeNull();
  });
});
