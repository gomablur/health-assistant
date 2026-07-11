import { assessPace, weightInsight } from '@/analytics/insights';
import { correlateDaily, ewma, lastDays, mean } from '@/analytics/stats';
import type { DailyPoint } from '@/health/types';
import { addDays, dayIndex, todayISO } from '@/utils/date';

/**
 * The daily brief: what the user used to get by screenshotting the Health app
 * into an LLM every morning, computed locally instead. Pure functions — rules
 * look at the series, emit prioritized findings, and the top one becomes the
 * headline. Event-driven rules (something changed today) outrank status
 * reports so the brief doesn't repeat itself day after day.
 */

export type BriefKind =
  | 'weight-noise'
  | 'weight-streak'
  | 'weight-pace-fast'
  | 'adherence-praise'
  | 'adherence-gap'
  | 'sleep-deficit'
  | 'sleep-gap'
  | 'heart-elevated'
  | 'steps-surge'
  | 'steps-decline'
  | 'correlation'
  | 'status';

export interface BriefFinding {
  kind: BriefKind;
  priority: number;
  /** chip label for compact display (≤6 chars) */
  chip: string;
  message: string;
  /** optional supporting sentence */
  detail?: string;
}

export interface DailyBrief {
  headline: BriefFinding;
  items: BriefFinding[];
}

export interface BriefSeries {
  weight: DailyPoint[];
  steps: DailyPoint[];
  sleep: DailyPoint[];
  restingHeartRate: DailyPoint[];
}

const kg = (v: number) => `${v.toFixed(1)}kg`;
const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

/** deterministic per-day pick so phrasing rotates instead of repeating */
function pick(templates: string[], seed: number): string {
  return templates[seed % templates.length];
}

function lastValue(points: DailyPoint[]): DailyPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

// --- rules -----------------------------------------------------------------

/** Yesterday's scale jump that the trend says is just noise — the #1 morning question. */
function weightNoise(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 8) return null;
  const latest = weight[weight.length - 1];
  const prev = weight[weight.length - 2];
  const gapDays = dayIndex(latest.date) - dayIndex(prev.date);
  if (gapDays > 3) return null;
  const deltaRaw = latest.value - prev.value;
  if (Math.abs(deltaRaw) < 0.5) return null;

  const smoothed = ewma(weight, 7);
  const trendNow = smoothed[smoothed.length - 1].value;
  const trendPrev = smoothed[smoothed.length - 2].value;
  const deltaTrend = trendNow - trendPrev;
  if (Math.abs(deltaTrend) > 0.15) return null; // the trend actually moved

  const direction = deltaRaw > 0 ? '増え' : '減り';
  return {
    kind: 'weight-noise',
    priority: 90,
    chip: 'ノイズ',
    message: pick(
      [
        `前回より${signed(deltaRaw)}kgと大きく${direction}ましたが、トレンド体重は${kg(trendNow)}でほぼ動いていません。`,
        `体重計は${signed(deltaRaw)}kg。でもならした本当の体重は${kg(trendNow)}のまま。慌てる変化ではありません。`,
      ],
      seed,
    ),
    detail: '1日単位の上下は水分や食事タイミングの揺れです。見るべきは移動平均のほう。',
  };
}

/** Consecutive weeks of the smoothed trend moving one direction. */
function weightStreak(weight: DailyPoint[], seed: number): BriefFinding | null {
  const smoothed = ewma(weight, 7);
  if (smoothed.length < 15) return null;
  const at = (daysAgo: number): number | null => {
    const target = dayIndex(smoothed[smoothed.length - 1].date) - daysAgo;
    let best: DailyPoint | null = null;
    for (const p of smoothed) {
      if (dayIndex(p.date) <= target) best = p;
      else break;
    }
    return best?.value ?? null;
  };
  let weeks = 0;
  let direction = 0;
  for (let w = 0; w < 8; w++) {
    const a = at(w * 7);
    const b = at((w + 1) * 7);
    if (a == null || b == null) break;
    const diff = a - b;
    if (Math.abs(diff) < 0.05) break;
    const sign = Math.sign(diff);
    if (direction === 0) direction = sign;
    if (sign !== direction) break;
    weeks++;
  }
  if (weeks < 2) return null;

  const insight = weightInsight(weight);
  const perWeek = insight.slopePerWeek;
  const word = direction < 0 ? '減少' : '増加';
  return {
    kind: 'weight-streak',
    priority: 70 + weeks,
    chip: direction < 0 ? '減少続く' : '増加続く',
    message: pick(
      [
        `トレンド体重が${weeks}週連続で${word}中です(週${signed(perWeek ?? 0, 2)}kgペース)。`,
        `${weeks}週間、ゆるやかな${word}が続いています。ペースは週${signed(perWeek ?? 0, 2)}kg。`,
      ],
      seed,
    ),
    detail:
      direction < 0
        ? '無理のない範囲(週0.5kg以内)なら理想的な減り方です。'
        : '気になる場合は、まず歩数と睡眠のリズムから見直すのがおすすめです。',
  };
}

/** Losing/gaining faster than the healthy bound. */
function weightPaceFast(weight: DailyPoint[]): BriefFinding | null {
  const insight = weightInsight(weight);
  if (insight.slopePerWeek == null || insight.trendR2 == null) return null;
  const pace = assessPace(insight.slopePerWeek);
  if (pace !== 'losing-fast' && pace !== 'gaining-fast') return null;
  if (insight.trendR2 < 0.3) return null; // noisy fit, don't alarm
  const word = insight.slopePerWeek < 0 ? '減少' : '増加';
  return {
    kind: 'weight-pace-fast',
    priority: 85,
    chip: '急ペース',
    message: `この4週間、週${signed(insight.slopePerWeek, 2)}kgとやや急な${word}ペースです。`,
    detail: '週0.5kgを超える変化は体への負担が大きめ。食事量と睡眠を一度見直してみましょう。',
  };
}

/** Streak of consecutive measurement days (praise at week milestones). */
function adherence(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length === 0) return null;
  const today = todayISO();
  const byDate = new Set(weight.map((p) => p.date));
  // allow the streak to be anchored at today or yesterday (before the morning weigh-in)
  let anchor = byDate.has(today) ? today : addDays(today, -1);
  if (!byDate.has(anchor)) {
    // gap: how many days since the last measurement?
    const last = lastValue(weight)!;
    const gap = dayIndex(today) - dayIndex(last.date);
    if (gap >= 3) {
      return {
        kind: 'adherence-gap',
        priority: 65,
        chip: '計測空き',
        message: `体重計測が${gap}日空いています。`,
        detail: '完璧じゃなくて大丈夫。今日1回乗るだけでトレンドの精度が戻ります。',
      };
    }
    return null;
  }
  let streak = 0;
  while (byDate.has(anchor)) {
    streak++;
    anchor = addDays(anchor, -1);
  }
  if (streak < 7 || streak % 7 !== 0) return null;
  return {
    kind: 'adherence-praise',
    priority: 55,
    chip: '継続中',
    message: pick(
      [
        `毎朝の計測が${streak}日続いています。継続は分析の土台、すばらしい習慣です。`,
        `計測ストリーク${streak}日目!データが溜まるほどトレンドの精度が上がります。`,
      ],
      seed,
    ),
  };
}

/** The watch hasn't recorded sleep for a couple of nights (forgot to wear / charge). */
function sleepGap(sleep: DailyPoint[]): BriefFinding | null {
  if (sleep.length < 5) return null; // only meaningful for someone who usually measures
  const last = sleep[sleep.length - 1];
  const gap = dayIndex(todayISO()) - dayIndex(last.date);
  if (gap < 2) return null;
  return {
    kind: 'sleep-gap',
    priority: 58,
    chip: '睡眠未計測',
    message: `睡眠が${gap}日計測できていません。`,
    detail: 'Apple Watchの充電と装着を確認してみてください。睡眠は分析の重要なピースです。',
  };
}

/** Three or more consecutive short nights. */
function sleepDeficit(sleep: DailyPoint[]): BriefFinding | null {
  if (sleep.length < 3) return null;
  const recent = sleep.slice(-3);
  const today = todayISO();
  if (dayIndex(today) - dayIndex(recent[recent.length - 1].date) > 1) return null;
  if (!recent.every((p) => p.value < 6)) return null;
  const avg = mean(recent.map((p) => p.value))!;
  return {
    kind: 'sleep-deficit',
    priority: 80,
    chip: '睡眠不足',
    message: `睡眠が3日続けて6時間を切っています(平均${avg.toFixed(1)}時間)。`,
    detail: '寝不足はむくみや食欲にも響きます。今夜は30分だけ早くベッドへ。',
  };
}

/** Resting heart rate sitting above the personal baseline. */
function heartElevated(heart: DailyPoint[]): BriefFinding | null {
  if (heart.length < 14) return null;
  const today = todayISO();
  const recent = lastDays(heart, 3, today);
  const baselineWindow = lastDays(heart, 30, addDays(today, -3));
  if (recent.length < 2 || baselineWindow.length < 10) return null;
  const recentAvg = mean(recent.map((p) => p.value))!;
  const baseline = mean(baselineWindow.map((p) => p.value))!;
  if (recentAvg - baseline < 4) return null;
  return {
    kind: 'heart-elevated',
    priority: 75,
    chip: '心拍高め',
    message: `安静時心拍がいつもより${Math.round(recentAvg - baseline)}bpm高めです(${Math.round(recentAvg)}bpm)。`,
    detail: '疲労やストレス、飲酒後にも上がります。数日続くようなら休息を優先して。',
  };
}

/** Yesterday was a big walking day / the weekly average is sliding. */
function stepsChange(steps: DailyPoint[], seed: number): BriefFinding | null {
  if (steps.length < 14) return null;
  const today = todayISO();
  const last = lastValue(steps)!;
  const isFreshEnough = dayIndex(today) - dayIndex(last.date) <= 1;
  const base = mean(lastDays(steps, 7, addDays(last.date, -1)).map((p) => p.value));
  if (isFreshEnough && base != null && last.value > base * 1.5 && last.value > 8000) {
    return {
      kind: 'steps-surge',
      priority: 60,
      chip: 'よく歩いた',
      message: pick(
        [
          `${Math.round(last.value).toLocaleString('ja-JP')}歩、いつもの1.5倍以上歩きました。`,
          `よく歩いた日でした(${Math.round(last.value).toLocaleString('ja-JP')}歩)。`,
        ],
        seed,
      ),
      detail: '翌日〜数日後の体重に効いてくるタイプの貯金です。',
    };
  }
  const thisWeek = mean(lastDays(steps, 7, today).map((p) => p.value));
  const prevWeek = mean(lastDays(steps, 14, addDays(today, -7)).map((p) => p.value));
  if (thisWeek != null && prevWeek != null && prevWeek > 0 && thisWeek < prevWeek * 0.75) {
    return {
      kind: 'steps-decline',
      priority: 50,
      chip: '歩数減',
      message: `今週の歩数が先週より${Math.round((1 - thisWeek / prevWeek) * 100)}%減っています。`,
      detail: '1駅歩く・昼に10分散歩、くらいの小さな一歩で十分戻せます。',
    };
  }
  return null;
}

/** Weekly correlation nugget (weekends only, needs a real signal). */
function correlation(weight: DailyPoint[], steps: DailyPoint[]): BriefFinding | null {
  const today = new Date();
  if (today.getDay() !== 0) return null; // Sundays: reflection day
  const deltas: DailyPoint[] = [];
  for (let i = 1; i < weight.length; i++) {
    deltas.push({ date: weight[i].date, value: weight[i].value - weight[i - 1].value });
  }
  let best: { r: number; lag: number; n: number } | null = null;
  for (let lag = 0; lag <= 7; lag++) {
    const c = correlateDaily(deltas, steps, lag);
    if (c && c.n >= 21 && (!best || Math.abs(c.r) > Math.abs(best.r))) {
      best = { r: c.r, lag: c.lagDays, n: c.n };
    }
  }
  if (!best || Math.abs(best.r) < 0.3) return null;
  const direction = best.r < 0 ? '減りやすい' : '増えやすい';
  return {
    kind: 'correlation',
    priority: 45,
    chip: '発見',
    message: `あなたのデータでは、よく歩いた日の${best.lag}日後に体重が${direction}傾向があります(r=${best.r.toFixed(2)})。`,
    detail: '相関は因果ではありませんが、生活のリズムを知るヒントになります。',
  };
}

/** Fallback status line — always available. */
function status(series: BriefSeries, seed: number): BriefFinding {
  const insight = weightInsight(series.weight);
  if (insight.trendWeight != null && insight.slopePerWeek != null) {
    const pace = assessPace(insight.slopePerWeek);
    const paceText =
      pace === 'stable'
        ? '安定しています'
        : `週${signed(insight.slopePerWeek, 2)}kgで${insight.slopePerWeek < 0 ? '減少' : '増加'}中です`;
    return {
      kind: 'status',
      priority: 10,
      chip: '順調',
      message: pick(
        [
          `トレンド体重は${kg(insight.trendWeight)}、${paceText}。`,
          `ならした体重は${kg(insight.trendWeight)}。${paceText}。`,
        ],
        seed,
      ),
      detail: '今日も計測おつかれさまです。淡々と続けるのがいちばん強い。',
    };
  }
  return {
    kind: 'status',
    priority: 10,
    chip: 'はじめの一歩',
    message: 'まだデータが少なめです。まずは毎朝の体重計測を1週間続けてみましょう。',
    detail: '7日分たまると、ノイズをならしたトレンドが見えてきます。',
  };
}

// --- assembly ---------------------------------------------------------------

const MAX_ITEMS = 3;

export function buildDailyBrief(
  series: BriefSeries,
  options?: { recentHeadlineKinds?: BriefKind[]; seed?: number },
): DailyBrief {
  const seed = options?.seed ?? dayIndex(todayISO());
  const recent = new Set(options?.recentHeadlineKinds ?? []);

  const ranked = [
    weightNoise(series.weight, seed),
    weightStreak(series.weight, seed),
    weightPaceFast(series.weight),
    adherence(series.weight, seed),
    sleepDeficit(series.sleep),
    sleepGap(series.sleep),
    heartElevated(series.restingHeartRate),
    stepsChange(series.steps, seed),
    correlation(series.weight, series.steps),
  ]
    .filter((f): f is BriefFinding => f !== null)
    .sort((a, b) => b.priority - a.priority);

  // yesterday's headline kind never headlines again today — it drops to the
  // items list and the status line takes over if nothing else is notable
  const headline = ranked.find((f) => !recent.has(f.kind)) ?? status(series, seed);
  const items = ranked.filter((f) => f !== headline).slice(0, MAX_ITEMS);
  return { headline, items };
}
