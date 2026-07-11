import { assessPace, stepsWeightLink, weightInsight } from '@/analytics/insights';
import { ewma, lastDays, mean } from '@/analytics/stats';
import type { DailyPoint } from '@/health/types';
import { addDays, dayIndex, todayISO } from '@/utils/date';

/**
 * デイリーブリーフ: かつて毎朝ヘルスケアのスクショをLLMに投げて得ていたものを、
 * 端末内の統計で置き換えたもの(このアプリの核)。純粋関数のみで構成。
 *
 * 仕組み: 各ルールが系列を見て優先度付きの「所見(finding)」を出し、最上位が
 * ヘッドラインになる。「今日何かが変わった」系のイベントルールを現状報告より
 * 高優先度にすることで、毎日同じことを言うブリーフにならないようにしている。
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
  /** コンパクト表示用のチップラベル(6文字以内目安) */
  chip: string;
  message: string;
  /** 補足の一文(チップ展開時に表示) */
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

/** 日替わりシードで言い回しをローテーションさせる(同じ文の繰り返しを避ける) */
function pick(templates: string[], seed: number): string {
  return templates[seed % templates.length];
}

function lastValue(points: DailyPoint[]): DailyPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

// --- ルール -----------------------------------------------------------------

/** 昨日からの体重ジャンプがトレンド的にはノイズ、という毎朝一番多い疑問への回答。 */
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
  if (Math.abs(deltaTrend) > 0.15) return null; // トレンド自体が動いた場合はノイズ扱いしない

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

/** トレンド体重が同方向に動き続けている連続週数。 */
function weightStreak(weight: DailyPoint[], seed: number): BriefFinding | null {
  const smoothed = ewma(weight, 7);
  if (smoothed.length < 15) return null;
  // daysAgo日前(以前)の直近のトレンド値
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

/** 健康的な目安(週0.5kg)を超える増減ペースの警告。 */
function weightPaceFast(weight: DailyPoint[]): BriefFinding | null {
  const insight = weightInsight(weight);
  if (insight.slopePerWeek == null || insight.trendR2 == null) return null;
  const pace = assessPace(insight.slopePerWeek);
  if (pace !== 'losing-fast' && pace !== 'gaining-fast') return null;
  if (insight.trendR2 < 0.3) return null; // フィットがノイズだらけなら騒がない
  const word = insight.slopePerWeek < 0 ? '減少' : '増加';
  return {
    kind: 'weight-pace-fast',
    priority: 85,
    chip: '急ペース',
    message: `この4週間、週${signed(insight.slopePerWeek, 2)}kgとやや急な${word}ペースです。`,
    detail: '週0.5kgを超える変化は体への負担が大きめ。食事量と睡眠を一度見直してみましょう。',
  };
}

/** 計測の連続日数(週の節目で称賛)/ 数日空いたら軽い後押し。 */
function adherence(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length === 0) return null;
  const today = todayISO();
  const byDate = new Set(weight.map((p) => p.date));
  // ストリークの起点は今日または昨日(朝の計測前でも途切れ扱いにしない)
  let anchor = byDate.has(today) ? today : addDays(today, -1);
  if (!byDate.has(anchor)) {
    // 途切れている: 最後の計測から何日空いたか
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

/** 数日間、睡眠が記録されていない(Watchの着け忘れ・充電切れ)。 */
function sleepGap(sleep: DailyPoint[]): BriefFinding | null {
  if (sleep.length < 5) return null; // 普段から計測している人にだけ意味がある
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

/** 短時間睡眠が3日以上連続。 */
function sleepDeficit(sleep: DailyPoint[]): BriefFinding | null {
  if (sleep.length < 3) return null;
  const recent = sleep.slice(-3);
  const today = todayISO();
  // 古いデータで警告しない(直近の記録が今日か昨日のときだけ)
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

/** 安静時心拍が本人のベースラインより高止まりしている。 */
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

/** 昨日たくさん歩いた / 週平均が下がってきている。 */
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

/** 週1回(日曜)の相関の小ネタ。確かな信号があるときだけ。 */
function correlation(weight: DailyPoint[], steps: DailyPoint[]): BriefFinding | null {
  if (new Date().getDay() !== 0) return null; // 日曜=振り返りの日
  const best = stepsWeightLink(weight, steps, 21); // 通常より多めのペア数を要求
  if (!best || Math.abs(best.r) < 0.3) return null;
  const direction = best.r < 0 ? '減りやすい' : '増えやすい';
  return {
    kind: 'correlation',
    priority: 45,
    chip: '発見',
    message: `あなたのデータでは、よく歩いた日の${best.lagDays}日後に体重が${direction}傾向があります(r=${best.r.toFixed(2)})。`,
    detail: '相関は因果ではありませんが、生活のリズムを知るヒントになります。',
  };
}

/** フォールバックの現状報告 — 常に生成できる。 */
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

// --- 組み立て ----------------------------------------------------------------

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

  // 昨日ヘッドラインだった種類は今日はヘッドラインにしない(itemsには残る)。
  // 他に目立つ所見がなければ現状報告(status)が引き継ぐ。
  const headline = ranked.find((f) => !recent.has(f.kind)) ?? status(series, seed);
  const items = ranked.filter((f) => f !== headline).slice(0, MAX_ITEMS);
  return { headline, items };
}
