import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { buildDailyBrief, type BriefSeries } from '../briefing';

/** 今日で終わる系列を作る: values[i] は (values.length-1-i) 日前の値 */
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
  it('特筆事項がなければ現状報告(status)がヘッドラインになる', () => {
    const brief = buildDailyBrief(baseSeries(), { seed: 0 });
    expect(brief.headline.kind).toBe('status');
    expect(brief.headline.message).toContain('72.0kg');
  });

  it('トレンドが平坦なら体重計の大きなジャンプをノイズと言い換える', () => {
    const weight = ending([...flat(29, 72), 72.9]); // 一晩で+0.9kg
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).toBe('weight-noise');
    expect(brief.headline.message).toContain('+0.9');
  });

  it('トレンド自体が動いたときはノイズ扱いしない', () => {
    // 毎日0.3kgずつ上昇: トレンドも動くので、ノイズの言い換えはしない
    const weight = ending(flat(30, 70).map((v, i) => v + i * 0.3));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).not.toBe('weight-noise');
  });

  it('複数週続くトレンドの連続を検出する', () => {
    // 30日間毎日-0.1kg = 明確な複数週の減少
    const weight = ending(flat(30, 75).map((v, i) => v - i * 0.1));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('weight-streak');
  });

  it('睡眠が数日計測されていないことに気づく', () => {
    const today = todayISO();
    const sleep = ending(flat(30, 7)).filter((p) => p.date <= addDays(today, -3));
    const brief = buildDailyBrief(baseSeries({ sleep }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('sleep-gap');
    expect(brief.headline.kind).not.toBe('sleep-deficit'); // 古いデータで警告してはいけない
  });

  it('3日連続の短時間睡眠を警告する', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const brief = buildDailyBrief(baseSeries({ sleep }), { seed: 0 });
    expect(brief.headline.kind).toBe('sleep-deficit');
  });

  it('ベースラインより高い安静時心拍を検出する', () => {
    const restingHeartRate = ending([...flat(27, 56), 63, 64, 62]);
    const brief = buildDailyBrief(baseSeries({ restingHeartRate }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('heart-elevated');
  });

  it('計測が空いたら後押しする', () => {
    const today = todayISO();
    const weight = ending(flat(30, 72)).filter((p) => p.date <= addDays(today, -4));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('adherence-gap');
  });

  it('計測7日連続を称賛する', () => {
    const weight = ending(flat(7, 72)); // ちょうど7日連続
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const kinds = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(kinds).toContain('adherence-praise');
  });

  it('昨日のヘッドライン種類は降格させて繰り返しを避ける', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const series = baseSeries({ sleep });
    const first = buildDailyBrief(series, { seed: 0 });
    expect(first.headline.kind).toBe('sleep-deficit');
    const second = buildDailyBrief(series, {
      seed: 0,
      recentHeadlineKinds: ['sleep-deficit'],
    });
    expect(second.headline.kind).not.toBe('sleep-deficit');
    // 所見自体はitemsには残っている
    expect(second.items.map((i) => i.kind)).toContain('sleep-deficit');
  });

  it('シードで言い回しがローテーションする', () => {
    const series = baseSeries();
    const a = buildDailyBrief(series, { seed: 0 }).headline.message;
    const b = buildDailyBrief(series, { seed: 1 }).headline.message;
    expect(a).not.toBe(b);
  });
});
