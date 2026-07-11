import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { buildDailyBrief, type BriefSeries } from '../briefing';

/** series ending today: values[i] is (values.length-1-i) days ago */
function ending(values: (number | null)[]): DailyPoint[] {
  const today = todayISO();
  const out: DailyPoint[] = [];
  values.forEach((v, i) => {
    if (v != null) out.push({ date: addDays(today, -(values.length - 1 - i)), value: v });
  });
  return out;
}

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

function baseSeries(overrides?: Partial<BriefSeries>): BriefSeries {
  return {
    weight: ending(flat(30, 72)),
    steps: ending(flat(30, 7500)),
    sleep: ending(flat(30, 7)),
    restingHeartRate: ending(flat(30, 57)),
    ...overrides,
  };
}

describe('buildDailyBrief', () => {
  it('falls back to a status headline when nothing is notable', () => {
    const brief = buildDailyBrief(baseSeries(), { seed: 0 });
    expect(brief.headline.kind).toBe('status');
    expect(brief.headline.message).toContain('72.0kg');
  });

  it('reframes a big scale jump as noise when the trend is flat', () => {
    const weight = ending([...flat(29, 72), 72.9]); // +0.9 overnight
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).toBe('weight-noise');
    expect(brief.headline.message).toContain('+0.9');
  });

  it('does not call it noise when the trend itself moved', () => {
    // steadily rising 0.3/day: trend moves too, so no noise reframe
    const weight = ending(flat(30, 70).map((v, i) => v + i * 0.3));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).not.toBe('weight-noise');
  });

  it('detects a multi-week trend streak', () => {
    // -0.1kg/day for 30 days = clear multi-week decline
    const weight = ending(flat(30, 75).map((v, i) => v - i * 0.1));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('weight-streak');
  });

  it('notices when sleep has not been measured for days', () => {
    const today = todayISO();
    const sleep = ending(flat(30, 7)).filter((p) => p.date <= addDays(today, -3));
    const brief = buildDailyBrief(baseSeries({ sleep }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('sleep-gap');
    expect(brief.headline.kind).not.toBe('sleep-deficit'); // stale data must not warn
  });

  it('warns about three consecutive short nights', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const brief = buildDailyBrief(baseSeries({ sleep }), { seed: 0 });
    expect(brief.headline.kind).toBe('sleep-deficit');
  });

  it('flags an elevated resting heart rate vs baseline', () => {
    const restingHeartRate = ending([...flat(27, 56), 63, 64, 62]);
    const brief = buildDailyBrief(baseSeries({ restingHeartRate }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('heart-elevated');
  });

  it('nudges after a measurement gap', () => {
    const today = todayISO();
    const weight = ending(flat(30, 72)).filter((p) => p.date <= addDays(today, -4));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('adherence-gap');
  });

  it('celebrates a 7-day measurement streak', () => {
    const weight = ending(flat(7, 72)); // exactly 7 consecutive days
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('adherence-praise');
  });

  it('demotes yesterday’s headline kind to avoid repeats', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const series = baseSeries({ sleep });
    const first = buildDailyBrief(series, { seed: 0 });
    expect(first.headline.kind).toBe('sleep-deficit');
    const second = buildDailyBrief(series, {
      seed: 0,
      recentHeadlineKinds: ['sleep-deficit'],
    });
    expect(second.headline.kind).not.toBe('sleep-deficit');
    // the finding is still visible in the items list
    expect(second.items.map((i) => i.kind)).toContain('sleep-deficit');
  });

  it('rotates phrasing by seed', () => {
    const series = baseSeries();
    const a = buildDailyBrief(series, { seed: 0 }).headline.message;
    const b = buildDailyBrief(series, { seed: 1 }).headline.message;
    expect(a).not.toBe(b);
  });
});
