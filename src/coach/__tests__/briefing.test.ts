import type { DailyPoint } from '@/health/types';
import { addDays, todayISO } from '@/utils/date';
import { buildDailyBrief, type BriefKind, type BriefSeries } from '../briefing';

/** 今日で終わる系列を作る: values[i] は (values.length-1-i) 日前の値。null はその日の未計測 */
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

/** ヘッドラインとチップの全種類(所見が items に埋もれていても検証できる) */
function kinds(series: BriefSeries, seed = 0): BriefKind[] {
  const brief = buildDailyBrief(series, { seed });
  return [brief.headline.kind, ...brief.items.map((i) => i.kind)];
}

describe('buildDailyBrief — 基本', () => {
  it('特筆事項がなければ現状報告(status)がヘッドラインになる', () => {
    const brief = buildDailyBrief(baseSeries(), { seed: 0 });
    expect(brief.headline.kind).toBe('status');
    expect(brief.headline.message).toContain('72.0kg');
  });

  it('データがまったくないときも落ちずに案内を返す', () => {
    const brief = buildDailyBrief(
      { weight: [], steps: [], sleep: [], restingHeartRate: [] },
      { seed: 0 },
    );
    expect(brief.headline.kind).toBe('status');
    expect(brief.headline.message).toContain('体重計');
  });

  it('シードで言い回しがローテーションする', () => {
    const series = baseSeries();
    const a = buildDailyBrief(series, { seed: 0 }).headline.message;
    const b = buildDailyBrief(series, { seed: 1 }).headline.message;
    expect(a).not.toBe(b);
  });
});

describe('今朝の解釈(このアプリの核)', () => {
  it('トレンドが平坦なら体重計の大きなジャンプをノイズと言い換える', () => {
    const weight = ending([...flat(29, 72), 72.9]); // 一晩で+0.9kg
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).toBe('weight-noise');
    expect(brief.headline.message).toContain('+0.9');
  });

  it('トレンド自体が動いたときはノイズ扱いしない', () => {
    // 毎日0.3kgずつ上昇: トレンドも動くので、ノイズの言い換えはしない
    const weight = ending(flat(30, 70).map((v, i) => v + i * 0.3));
    expect(kinds(baseSeries({ weight }))).not.toContain('weight-noise');
  });

  it('昨日跳ねた体重が今朝戻ったら、それを最優先で伝える', () => {
    // 一昨日72.0 → 昨日72.9(+0.9) → 今朝72.1(ほぼ戻った)
    const weight = ending([...flat(28, 72), 72.9, 72.1]);
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    expect(brief.headline.kind).toBe('weight-noise-resolved');
    expect(brief.headline.detail).toContain('トレンド体重');
  });

  it('跳ねたまま戻っていなければ「戻った」とは言わない', () => {
    // 昨日+0.9のあと、今朝もほぼ同じ高さ(72.8)
    const weight = ending([...flat(28, 72), 72.9, 72.8]);
    expect(kinds(baseSeries({ weight }))).not.toContain('weight-noise-resolved');
  });
});

describe('トレンドの節目', () => {
  it('複数週続くトレンドの連続を検出する', () => {
    // 30日間毎日-0.1kg = 明確な複数週の減少
    const weight = ending(flat(30, 75).map((v, i) => v - i * 0.1));
    expect(kinds(baseSeries({ weight }))).toContain('weight-streak');
  });

  it('減っていた体重が2週間止まったら「停滞期」と説明する', () => {
    // 20日かけて減少(74.0 → 72.7)したあと、21日間ぴったり横ばい。
    // EWMA(半減期7日)は遅れて追従するので、停滞の判定には3週ぶんの横ばいが要る
    const values = [...flat(20, 74).map((v, i) => v - i * 0.07), ...flat(21, 72.6)];
    const brief = buildDailyBrief(baseSeries({ weight: ending(values) }), { seed: 0 });
    const all = [brief.headline.kind, ...brief.items.map((i) => i.kind)];
    expect(all).toContain('weight-plateau');
    const plateau = [brief.headline, ...brief.items].find((f) => f.kind === 'weight-plateau')!;
    expect(plateau.detail).toContain('停滞は失敗ではなく');
  });

  it('ずっと横ばいなだけ(もともと減っていない)なら停滞とは言わない', () => {
    expect(kinds(baseSeries())).not.toContain('weight-plateau');
  });

  it('停滞のあとに動き出したら「停滞明け」を祝う', () => {
    // 21日前〜8日前: 横ばい / 直近7日: はっきり減少
    const values = [...flat(23, 72), ...flat(7, 72).map((v, i) => v - (i + 1) * 0.12)];
    const brief = buildDailyBrief(baseSeries({ weight: ending(values) }), { seed: 0 });
    expect(brief.headline.kind).toBe('weight-plateau-break');
  });

  /** 減少 → リバウンドして横ばい → 再下降。tail = 再下降の日数 */
  const reboundThenDrop = (tail: number) =>
    ending([
      ...flat(20, 74).map((v, i) => v - i * 0.05), // 74.0 → 73.05
      ...flat(40 - tail, 73.6), // リバウンド横ばい(この間に旧・底が確定する)
      ...flat(tail, 73.6).map((v, i) => v - (i + 1) * 0.12), // 再下降
    ]);

  it('2週間以上守られた床を割った当日に「最低更新」と伝える', () => {
    expect(kinds(baseSeries({ weight: reboundThenDrop(6) }))).toContain('weight-new-low');
  });

  it('一度割ったあとは繰り返さない(節目は一度きり)', () => {
    // 同じ下降の数日後。すでに床は割っているので、もう節目ではない
    expect(kinds(baseSeries({ weight: reboundThenDrop(10) }))).not.toContain('weight-new-low');
  });

  it('減り続けている最中は毎日「最低更新」と言わない(通知の価値を守る)', () => {
    // 60日間ずっと減少 = 毎日が最低値。ここで祝っても意味がない
    const values = flat(60, 78).map((v, i) => v - i * 0.05);
    expect(kinds(baseSeries({ weight: ending(values) }))).not.toContain('weight-new-low');
  });

  it('急な減少ペースには注意を促す(ただし断定的な医療表現はしない)', () => {
    const weight = ending(flat(30, 80).map((v, i) => v - i * 0.12)); // 週-0.84kg
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const fast = [brief.headline, ...brief.items].find((f) => f.kind === 'weight-pace-fast');
    expect(fast).toBeDefined();
    expect(fast!.detail).toContain('筋肉');
  });
});

describe('からだの変化(イベントは開いたら閉じる)', () => {
  it('3日連続の短時間睡眠を警告する', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const brief = buildDailyBrief(baseSeries({ sleep }), { seed: 0 });
    expect(brief.headline.kind).toBe('sleep-deficit');
  });

  it('睡眠不足のあと眠れるようになったら、それも伝える', () => {
    // 6〜4日前が短時間、直近3日は回復
    const sleep = ending([...flat(24, 7), 5.4, 5.6, 5.8, 7.2, 7.4, 7.1]);
    expect(kinds(baseSeries({ sleep }))).toContain('sleep-recovered');
  });

  it('ベースラインより高い安静時心拍を検出する', () => {
    const restingHeartRate = ending([...flat(27, 56), 63, 64, 62]);
    expect(kinds(baseSeries({ restingHeartRate }))).toContain('heart-elevated');
  });

  it('心拍が平常値に戻ったら「戻った」と伝える', () => {
    // 6〜4日前が高め、直近3日はベースラインに復帰
    const restingHeartRate = ending([...flat(24, 56), 63, 64, 62, 57, 56, 57]);
    const found = kinds(baseSeries({ restingHeartRate }));
    expect(found).toContain('heart-recovered');
    expect(found).not.toContain('heart-elevated');
  });

  it('心拍の所見に診断的な表現を含めない(相談を促すに留める)', () => {
    const restingHeartRate = ending([...flat(27, 56), 63, 64, 62]);
    const brief = buildDailyBrief(baseSeries({ restingHeartRate }), { seed: 0 });
    const finding = [brief.headline, ...brief.items].find((f) => f.kind === 'heart-elevated')!;
    expect(finding.detail).toContain('医療機関に相談');
    expect(finding.detail).not.toMatch(/病気|診断|治療/);
  });
});

describe('生活のリズム', () => {
  it('よく歩いた日を拾い、翌朝の体重増を先回りで説明する', () => {
    const steps = ending([...flat(29, 6000), 15000]);
    const brief = buildDailyBrief(baseSeries({ steps }), { seed: 0 });
    const surge = [brief.headline, ...brief.items].find((f) => f.kind === 'steps-surge')!;
    expect(surge.detail).toContain('水分');
  });

  it('歩数が増えた週を肯定する', () => {
    const steps = ending([...flat(23, 5000), ...flat(7, 9000)]);
    expect(kinds(baseSeries({ steps }))).toContain('steps-rise');
  });

  it('歩数が落ちた週は責めずに後押しする', () => {
    const steps = ending([...flat(23, 9000), ...flat(7, 4000)]);
    const brief = buildDailyBrief(baseSeries({ steps }), { seed: 0 });
    const decline = [brief.headline, ...brief.items].find((f) => f.kind === 'steps-decline')!;
    expect(decline.detail).toContain('小さな一歩');
  });
});

describe('計測の習慣', () => {
  it('7日分たまった瞬間に「トレンドが使える」と伝える', () => {
    const weight = ending(flat(7, 72));
    expect(kinds(baseSeries({ weight }))).toContain('data-ready');
  });

  it('計測が空いたら後押しする(責めない)', () => {
    const today = todayISO();
    const weight = ending(flat(30, 72)).filter((p) => p.date <= addDays(today, -4));
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const gap = [brief.headline, ...brief.items].find((f) => f.kind === 'adherence-gap')!;
    expect(gap.detail).toContain('責めるためのアプリではない');
  });

  it('計測7日連続を称賛する', () => {
    const weight = ending(flat(14, 72)); // 14日連続(7の倍数)
    expect(kinds(baseSeries({ weight }))).toContain('adherence-praise');
  });

  it('睡眠が数日計測されていないことに気づく(古いデータで不足警告はしない)', () => {
    const today = todayISO();
    const sleep = ending(flat(30, 7)).filter((p) => p.date <= addDays(today, -3));
    const found = kinds(baseSeries({ sleep }));
    expect(found).toContain('sleep-gap');
    expect(found).not.toContain('sleep-deficit');
  });
});

describe('発見', () => {
  it('体重が横ばいでも体脂肪率が落ちていれば「中身が変わっている」と伝える', () => {
    const bodyFat = ending(flat(30, 22).map((v, i) => v - i * 0.03)); // 4週で約-0.8pt
    const found = kinds(baseSeries({ bodyFat }));
    expect(found).toContain('body-recomposition');
  });

  it('体脂肪率のデータがなければ体組成の所見は出さない(スマート体重計は必須ではない)', () => {
    expect(kinds(baseSeries())).not.toContain('body-recomposition');
  });

  /** 84日ぶんの体重。指定した曜日だけ +0.6kg 重く出る(全体はゆるやかに減少) */
  function weightWithHeavyWeekday(heavyDow: number): DailyPoint[] {
    const today = todayISO();
    const out: DailyPoint[] = [];
    for (let i = 83; i >= 0; i--) {
      const date = addDays(today, -i);
      const dow = new Date(`${date}T00:00:00`).getDay();
      const base = 75 - (83 - i) * 0.01; // ゆるやかな減少トレンド
      out.push({ date, value: base + (dow === heavyDow ? 0.6 : 0) });
    }
    return out;
  }

  it('「重く出る曜日」の朝にだけ、先回りして知らせる', () => {
    const todayDow = new Date(`${todayISO()}T00:00:00`).getDay();
    const weight = weightWithHeavyWeekday(todayDow); // 今日が「重い曜日」
    const brief = buildDailyBrief(baseSeries({ weight }), { seed: 0 });
    const found = [brief.headline, ...brief.items].find((f) => f.kind === 'weekday-pattern');
    expect(found).toBeDefined();
    expect(found!.detail).toContain('トレンドの向きだけ見ておけば');
  });

  it('重い曜日でない日には言わない(毎日ヘッドラインを占拠させない)', () => {
    const todayDow = new Date(`${todayISO()}T00:00:00`).getDay();
    const weight = weightWithHeavyWeekday((todayDow + 3) % 7); // 重い曜日は今日ではない
    expect(kinds(baseSeries({ weight }))).not.toContain('weekday-pattern');
  });
});

describe('繰り返しの回避', () => {
  it('昨日のヘッドライン種類は降格させる(所見自体は items に残る)', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const series = baseSeries({ sleep });
    expect(buildDailyBrief(series, { seed: 0 }).headline.kind).toBe('sleep-deficit');

    const second = buildDailyBrief(series, { seed: 0, yesterdayKind: 'sleep-deficit' });
    expect(second.headline.kind).not.toBe('sleep-deficit');
    expect(second.items.map((i) => i.kind)).toContain('sleep-deficit');
  });

  it('数日前のヘッドラインは減点するが、他に何もなければまた選ばれる', () => {
    const sleep = ending([...flat(27, 7), 5.5, 5.8, 5.2]);
    const series = baseSeries({ sleep });
    const brief = buildDailyBrief(series, { seed: 0, staleKinds: ['sleep-deficit'] });
    // 減点(-15)されてもなお最上位なので、ヘッドラインには残る
    expect(brief.headline.kind).toBe('sleep-deficit');
  });

  it('減点によって、僅差の別の所見に順番を譲る', () => {
    // 心拍高め(75) と 停滞期(72) が両立する状況を作る
    const restingHeartRate = ending([...flat(27, 56), 63, 64, 62]);
    const weight = ending([...flat(20, 74).map((v, i) => v - i * 0.07), ...flat(21, 72.6)]);
    const series = baseSeries({ restingHeartRate, weight });

    expect(buildDailyBrief(series, { seed: 0 }).headline.kind).toBe('heart-elevated');
    // 心拍を減点すると 75-15=60 となり、停滞期(72)に抜かれる
    const demoted = buildDailyBrief(series, { seed: 0, staleKinds: ['heart-elevated'] });
    expect(demoted.headline.kind).toBe('weight-plateau');
  });
});
