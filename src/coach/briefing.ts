import { assessPace, stepsWeightLink, weightInsight } from '@/analytics/insights';
import { ewma, lastDays, linearTrend, mean } from '@/analytics/stats';
import type { DailyPoint } from '@/health/types';
import { addDays, dayIndex, fromISODate, todayISO } from '@/utils/date';

/**
 * デイリーブリーフ: かつて毎朝ヘルスケアのスクショをLLMに投げて得ていたものを、
 * 端末内の統計で置き換えたもの(このアプリの核)。純粋関数のみで構成。
 *
 * 仕組み: 各ルールが系列を見て優先度付きの「所見(finding)」を出し、最上位が
 * ヘッドラインになる。「今日何かが変わった」系のイベントルールを現状報告より
 * 高優先度にすることで、毎日同じことを言うブリーフにならないようにしている。
 *
 * 設計の原則(docs/BRAND.md の「やらないこと」に対応):
 * - **解釈を返す。** 数値の再掲(ヘルスケアを見れば分かること)はしない。
 *   「今朝+0.9kg」ではなく「その+0.9kgは水分で、トレンドは動いていない」と言う
 * - **不安を煽らない。** 警告系ルールには必ず「落ち着ける事実」か「小さな次の一歩」を
 *   添える。スコアもランキングも出さない
 * - **イベントは閉じる。** 「心拍が高い」と言ったら、戻ったときに「戻りました」と言う。
 *   開きっぱなしにしない(*-recovered 系ルール)
 * - **診断しない。** 医療判断は絶対にしない。最大でも「続くようなら医療機関に相談」止まり
 */

export type BriefKind =
  // 今朝の解釈(このアプリの核)
  | 'weight-suspect'
  | 'weight-noise'
  | 'weight-noise-resolved'
  // トレンドの節目
  | 'weight-plateau-break'
  | 'weight-plateau'
  | 'weight-new-low'
  | 'weight-streak'
  | 'weight-pace-fast'
  // からだの変化
  | 'sleep-deficit'
  | 'sleep-recovered'
  | 'heart-elevated'
  | 'heart-recovered'
  // 生活のリズム
  | 'steps-surge'
  | 'steps-rise'
  | 'steps-decline'
  // 計測の習慣
  | 'data-ready'
  | 'adherence-praise'
  | 'adherence-gap'
  | 'sleep-gap'
  // 発見
  | 'body-recomposition'
  | 'weekday-pattern'
  | 'correlation'
  // フォールバック
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
  /** スマート体重計がないユーザーもいるので任意。体組成の所見にだけ使う */
  bodyFat?: DailyPoint[];
}

/**
 * 優先度の帯(数字の意味):
 *  90番台 今朝の体重の解釈 — 毎朝一番知りたいこと。このアプリの存在理由
 *  80番台 見逃してほしくない変化(急ペース・睡眠不足)と、うれしい節目(停滞明け)
 *  70番台 トレンドの節目(最低値更新・停滞・連続)と体調のサイン
 *  50〜60番台 計測の習慣、生活リズム、イベントの「閉じ」
 *  40番台 発見(相関・体組成・曜日リズム) — 急がないが面白い
 *  10      現状報告(フォールバック。常に生成できる)
 */

const kg = (v: number) => `${v.toFixed(1)}kg`;
const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
const steps = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}歩`;

/** 日替わりシードで言い回しをローテーションさせる(同じ文の繰り返しを避ける) */
function pick(templates: string[], seed: number): string {
  return templates[seed % templates.length];
}

function lastValue(points: DailyPoint[]): DailyPoint | null {
  return points.length > 0 ? points[points.length - 1] : null;
}

/** 今日すでに計測済みか(アプリ名「けさのからだ」どおり、今朝の話として語るための判定) */
function measuredToday(points: DailyPoint[]): boolean {
  return lastValue(points)?.date === todayISO();
}

/** EWMAトレンド系列の「daysAgo日前(以前)の直近値」。計測の抜けに強い。 */
function trendAt(smoothed: DailyPoint[], daysAgo: number): number | null {
  if (smoothed.length === 0) return null;
  const target = dayIndex(smoothed[smoothed.length - 1].date) - daysAgo;
  let best: DailyPoint | null = null;
  for (const p of smoothed) {
    if (dayIndex(p.date) <= target) best = p;
    else break;
  }
  return best?.value ?? null;
}

/** トレンドが「動いていない」とみなす週あたりの幅(kg)。体重計の分解能と体感から。 */
const FLAT_PER_WEEK = 0.15;
/** 「はっきり動いた」とみなす週あたりの幅(kg)。停滞の判定と重ならないよう余裕を取る */
const MOVED_PER_WEEK = 0.25;

/**
 * 期間ごとの週あたり変化量(kg/週)を、生データの線形回帰で求める。
 *
 * EWMAではなく回帰を使うのは、EWMAには遅れがあるため。半減期7日のEWMAでは、
 * 21日間ぴったり横ばいのデータでも週-0.16kgの「減少」に見えてしまい、
 * 停滞をまったく検出できない(実測済み)。回帰なら遅れがない。
 */
function slopeOverWindow(
  weight: DailyPoint[],
  days: number,
  endISO: string,
  minPoints: number,
): number | null {
  const window = lastDays(weight, days, endISO);
  if (window.length < minPoints) return null;
  return linearTrend(window)?.slopePerWeek ?? null;
}

/**
 * 一晩で動きうる体重の上限(kg)。水分・食事の揺れはここまで。これを超える変化は
 * 生理的にあり得ない(脂肪1kgの増減に約7,000kcalが必要)ので、計測ミスを疑う。
 */
const IMPLAUSIBLE_DAILY_DELTA = 3.0;

// --- ルール: 今朝の解釈 --------------------------------------------------------

/**
 * 生理的にあり得ない変化 = 計測ミス(別の人が乗った・服のまま・体重計の故障)。
 *
 * これを黙って「水分の揺れです」と説明してしまうと嘘になるし、放置すると
 * トレンドが数週間にわたって汚染される。事実だけを伝えて、判断はユーザーに委ねる
 * (「誤りだ」と断定はしない。本当に増えた可能性を否定はできないため)。
 *
 * **アプリ側で外れ値を除外することはしない。** 記録の正しさはOSのヘルス基盤の責務で、
 * うちは解釈に徹する(docs/BRAND.md)。勝手に間引くとOSの表示と食い違い、
 * 「独自の記録を持つアプリ」になってしまう。だから直し方(元データの削除)を案内する。
 */
function weightSuspect(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 2) return null;
  const latest = weight[weight.length - 1];
  const prev = weight[weight.length - 2];
  const gapDays = dayIndex(latest.date) - dayIndex(prev.date);
  if (gapDays > 2) return null; // 期間が空いていれば大きな変化もあり得る
  const delta = latest.value - prev.value;
  if (Math.abs(delta) < IMPLAUSIBLE_DAILY_DELTA) return null;

  return {
    kind: 'weight-suspect',
    priority: 92,
    chip: '要確認',
    message: pick(
      [
        `前回から${signed(delta)}kgの変化です。${gapDays === 1 ? '一晩' : '2日'}でこれだけ動くのは、計測ミスかもしれません。`,
        `${kg(latest.value)}という値は、前回から${signed(delta)}kg。少し確かめたほうがよさそうです。`,
      ],
      seed,
    ),
    detail:
      '別の人が乗った、服を着たまま測った、電池が弱っている、といった原因が考えられます。一晩で3kgを超える増減は、水分では説明がつきません(脂肪1kgの増減には約7,000kcalが必要です)。誤りであれば、OSのヘルスアプリ(ヘルスケア / ヘルスコネクト)でその記録を削除してください。削除すれば、こちらのトレンドも次回から正しく計算されます。',
  };
}

/**
 * 昨日跳ねた体重が、今朝きれいに戻った — このアプリの主張(日々の上下は天気、
 * トレンドが気候)を最もはっきり証明する瞬間。他の何より先に伝える。
 */
function weightNoiseResolved(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 9) return null;
  if (!measuredToday(weight)) return null;
  const [twoAgo, yesterday, today] = weight.slice(-3);
  // 3点が連日でなければ「戻った」とは言えない
  if (dayIndex(today.date) - dayIndex(twoAgo.date) !== 2) return null;

  const spike = yesterday.value - twoAgo.value;
  const back = today.value - yesterday.value;
  if (spike < 0.5) return null; // 跳ねていない
  if (back > -0.4) return null; // 戻っていない
  // 跳ねる前の水準までおおむね戻ったか(半分以上戻っていれば「戻った」と呼ぶ)
  if (today.value - twoAgo.value > spike * 0.5) return null;

  const smoothed = ewma(weight, 7);
  const trendNow = smoothed[smoothed.length - 1].value;
  return {
    kind: 'weight-noise-resolved',
    priority: 95,
    chip: '戻った',
    message: pick(
      [
        `昨日の${signed(spike)}kgは、今朝きれいに消えています。やっぱり水分の揺れでした。`,
        `昨日跳ねた${signed(spike)}kgは今朝${signed(back)}kg戻りました。体重計はこういう嘘をつきます。`,
        `今朝は${kg(today.value)}。昨日の${signed(spike)}kgは一晩で帳消しです。`,
      ],
      seed,
    ),
    detail: `トレンド体重は${kg(trendNow)}。1日の上下に意味はほとんどありません。見るべきはこちらです。`,
  };
}

/** 昨日からの体重ジャンプがトレンド的にはノイズ、という毎朝一番多い疑問への回答。 */
function weightNoise(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 8) return null;
  const latest = weight[weight.length - 1];
  const prev = weight[weight.length - 2];
  const gapDays = dayIndex(latest.date) - dayIndex(prev.date);
  if (gapDays > 3) return null;
  const deltaRaw = latest.value - prev.value;
  if (Math.abs(deltaRaw) < 0.5) return null;
  // あり得ない大きさの変化を「水分です」と説明したら嘘になる(weightSuspect の担当)
  if (Math.abs(deltaRaw) >= IMPLAUSIBLE_DAILY_DELTA) return null;

  const smoothed = ewma(weight, 7);
  const trendNow = smoothed[smoothed.length - 1].value;
  const trendPrev = smoothed[smoothed.length - 2].value;
  const deltaTrend = trendNow - trendPrev;
  if (Math.abs(deltaTrend) > FLAT_PER_WEEK) return null; // トレンド自体が動いた場合はノイズ扱いしない

  const up = deltaRaw > 0;
  const direction = up ? '増え' : '減り';
  const today = measuredToday(weight);
  return {
    kind: 'weight-noise',
    priority: 90,
    chip: 'ノイズ',
    message: pick(
      [
        `${today ? '今朝は' : '前回より'}${signed(deltaRaw)}kgと大きく${direction}ましたが、トレンド体重は${kg(trendNow)}でほぼ動いていません。`,
        `体重計は${signed(deltaRaw)}kg。でもならした本当の体重は${kg(trendNow)}のまま。慌てる変化ではありません。`,
        `${signed(deltaRaw)}kgの${direction}は、トレンドから見れば誤差の範囲です(トレンド体重${kg(trendNow)})。`,
        up
          ? `${signed(deltaRaw)}kg増えていますが、これは水分です。${kg(trendNow)}というトレンドは今日も無傷。`
          : `${signed(deltaRaw)}kg減っていますが、まだ喜ぶには早いです。トレンドは${kg(trendNow)}のまま動いていません。`,
      ],
      seed,
    ),
    detail:
      '1日単位の上下は、水分・塩分・食事のタイミングで簡単に1kg動きます。脂肪1kgを増減するには約7,000kcalが必要で、一晩では起きません。',
  };
}

// --- ルール: トレンドの節目 ----------------------------------------------------

/**
 * 停滞を抜けた瞬間。ダイエットで最も報われる瞬間なので、確実に拾って祝う。
 * (2週以上トレンドが動かなかったあとに、今週はっきり動いた)
 */
function weightPlateauBreak(weight: DailyPoint[], seed: number): BriefFinding | null {
  const today = todayISO();
  const now = slopeOverWindow(weight, 10, today, 6); // 直近10日
  const before = slopeOverWindow(weight, 21, addDays(today, -10), 10); // その前の3週間
  if (now == null || before == null) return null;
  if (Math.abs(before) >= FLAT_PER_WEEK) return null; // 前が停滞していない
  if (now > -MOVED_PER_WEEK) return null; // 今、下向きに動いていない

  const trendNow = ewma(weight, 7).slice(-1)[0]?.value;
  return {
    kind: 'weight-plateau-break',
    priority: 88,
    chip: '停滞明け',
    message: pick(
      [
        `止まっていたトレンドが動き出しました。直近は週${signed(now, 2)}kgのペースです。`,
        `停滞明けです。3週間動かなかった体重が、また下り始めました${trendNow != null ? `(トレンド${kg(trendNow)})` : ''}。`,
        `ようやく足踏みを抜けました。週${signed(now, 2)}kgペースで再び下降しています。`,
      ],
      seed,
    ),
    detail:
      '停滞のあとに一気に動くのはよくあるパターンです。体が水分を溜め込むのをやめると、減っていた脂肪の分がまとめて数字に現れます。',
  };
}

/**
 * 停滞期。「減っていたのに止まった」はダイエットで最も心が折れる場面であり、
 * 「それは正常です」と言えることが解釈アプリの最大の存在価値。
 * (以前は減っていて、直近2週はトレンドが動いていない)
 */
function weightPlateau(weight: DailyPoint[], seed: number): BriefFinding | null {
  const today = todayISO();
  const now = slopeOverWindow(weight, 14, today, 8); // 直近2週間
  const before = slopeOverWindow(weight, 21, addDays(today, -14), 10); // その前の3週間
  if (now == null || before == null) return null;
  if (Math.abs(now) >= FLAT_PER_WEEK) return null; // 今、止まっていない
  if (before > -MOVED_PER_WEEK) return null; // 以前が減っていない(ただの横ばい継続なら黙る)

  const trendNow = ewma(weight, 7).slice(-1)[0]?.value;
  const level = trendNow != null ? kg(trendNow) : '今の水準';
  return {
    kind: 'weight-plateau',
    priority: 72,
    chip: '停滞期',
    message: pick(
      [
        `トレンド体重が2週間ほど${level}で止まっています。停滞期に入ったようです。`,
        `ここ2週間、トレンドは${level}で横ばい。順調に減っていたぶん、もどかしい時期です。`,
        `減少が一度止まりました(トレンド${level})。よくある停滞で、やり方が間違ったわけではありません。`,
      ],
      seed,
    ),
    detail:
      '停滞は失敗ではなく、体が変化に慣れる過程です。ここで極端に食事を削ると代謝が落ちて逆効果になりがち。今のやり方を淡々と続けるのがいちばん近道です。',
  };
}

/**
 * トレンド体重が直近2か月の最低を更新した(スコアではなく事実の通知)。
 *
 * ただし「2週間以上守られてきた床を割った」ときだけ出す。順調に減り続けている人は
 * 毎日が最低更新になってしまい、通知としての意味を失う(=BRAND.mdの「通知爆撃を
 * しない」に反する)。停滞やリバウンドを経て更新したときこそ節目になる。
 */
function weightNewLow(weight: DailyPoint[], seed: number): BriefFinding | null {
  const smoothed = ewma(weight, 7);
  if (smoothed.length < 30) return null;
  const last = smoothed[smoothed.length - 1];
  const recent = lastDays(smoothed, 60, last.date);
  if (recent.length < 25) return null;

  // 「2週間以上前に作られた床」とだけ比べる。減少の真っ最中は昨日が常に最低値に
  // なるため、直近の値を床に含めると毎日発火してしまう
  const old = recent.filter((p) => dayIndex(last.date) - dayIndex(p.date) >= 14);
  if (old.length < 10) return null;
  const floor = old.reduce((a, b) => (b.value < a.value ? b : a));

  const now = last.value;
  const prev = recent[recent.length - 2]?.value;
  if (now >= floor.value - 0.05) return null; // まだ割っていない
  if (prev != null && prev < floor.value - 0.05) return null; // 昨日すでに割っていた = 今日の節目ではない
  return {
    kind: 'weight-new-low',
    priority: 78,
    chip: '最低更新',
    message: pick(
      [
        `トレンド体重${kg(now)}。この2か月でいちばん低い値を更新しました。`,
        `${kg(now)}。しばらく破れなかった壁(${kg(floor.value)})を下回りました。`,
        `トレンドが${kg(now)}まで下りました。60日間でいちばん軽い体です。`,
      ],
      seed,
    ),
    detail:
      '1日の最低値ではなく、ならしたトレンドが更新されたということは、水分の偶然ではなく本物の変化です。しかもこの水準は2週間以上破れていませんでした。',
  };
}

/** トレンド体重が同方向に動き続けている連続週数。 */
function weightStreak(weight: DailyPoint[], seed: number): BriefFinding | null {
  const smoothed = ewma(weight, 7);
  if (smoothed.length < 15) return null;
  let weeks = 0;
  let direction = 0;
  for (let w = 0; w < 8; w++) {
    const a = trendAt(smoothed, w * 7);
    const b = trendAt(smoothed, (w + 1) * 7);
    if (a == null || b == null) break;
    const diff = a - b;
    // 「動いた」の閾値は停滞バンドと同じ。これより小さい動きは停滞ルールの担当で、
    // ここで拾うとEWMAの遅れによる見かけの減少を「連続」と誤認する
    if (Math.abs(diff) < FLAT_PER_WEEK) break;
    const sign = Math.sign(diff);
    if (direction === 0) direction = sign;
    if (sign !== direction) break;
    weeks++;
  }
  if (weeks < 2) return null;

  const insight = weightInsight(weight);
  const perWeek = insight.slopePerWeek;
  const down = direction < 0;
  const word = down ? '減少' : '増加';
  return {
    kind: 'weight-streak',
    priority: 70 + weeks,
    chip: down ? '減少続く' : '増加続く',
    message: pick(
      [
        `トレンド体重が${weeks}週連続で${word}中です(週${signed(perWeek ?? 0, 2)}kgペース)。`,
        `${weeks}週間、ゆるやかな${word}が続いています。ペースは週${signed(perWeek ?? 0, 2)}kg。`,
        down
          ? `${weeks}週続けてトレンドが下向き。派手さはありませんが、これがいちばん強い減り方です。`
          : `${weeks}週続けてトレンドが上向きです。原因を1つだけ思い当たるなら、そこから。`,
      ],
      seed,
    ),
    detail: down
      ? '週0.5kg以内なら、筋肉を保ったまま減らせる理想的なペースです。'
      : '増加そのものが悪いわけではありません。気になるなら、まず睡眠と歩数のリズムから見直すのがおすすめです。',
  };
}

/** 健康的な目安(週0.5kg)を超える増減ペースの警告。 */
function weightPaceFast(weight: DailyPoint[], seed: number): BriefFinding | null {
  const insight = weightInsight(weight);
  if (insight.slopePerWeek == null || insight.trendR2 == null) return null;
  const pace = assessPace(insight.slopePerWeek);
  if (pace !== 'losing-fast' && pace !== 'gaining-fast') return null;
  if (insight.trendR2 < 0.3) return null; // フィットがノイズだらけなら騒がない
  const losing = insight.slopePerWeek < 0;
  const word = losing ? '減少' : '増加';
  return {
    kind: 'weight-pace-fast',
    priority: 85,
    chip: '急ペース',
    message: pick(
      [
        `この4週間、週${signed(insight.slopePerWeek, 2)}kgとやや急な${word}ペースです。`,
        `${word}ペースが週${signed(insight.slopePerWeek, 2)}kg。少し急いでいるかもしれません。`,
      ],
      seed,
    ),
    detail: losing
      ? '週0.5kgを超える減少では、脂肪だけでなく筋肉も落ちやすくなります。食事量を極端に削っていないか、睡眠が足りているか確認してみてください。'
      : '週0.5kgを超える増加が続くときは、食事より先に睡眠と活動量を疑うのが近道です。',
  };
}

// --- ルール: からだの変化 ------------------------------------------------------

/** 短時間睡眠が3日以上連続。 */
function sleepDeficit(sleep: DailyPoint[], seed: number): BriefFinding | null {
  if (sleep.length < 3) return null;
  const recent = sleep.slice(-3);
  const today = todayISO();
  // 古いデータで警告しない(直近の記録が今日か昨日のときだけ)
  if (dayIndex(today) - dayIndex(recent[recent.length - 1].date) > 1) return null;
  // 「3日続けて」と言う以上、本当に連日でなければならない。Watchを外した日が
  // あると直近3件が飛び飛びになり、実際には連続していない3晩を連続と誤認する
  if (dayIndex(recent[2].date) - dayIndex(recent[0].date) !== 2) return null;
  if (!recent.every((p) => p.value < 6)) return null;
  const avg = mean(recent.map((p) => p.value))!;
  return {
    kind: 'sleep-deficit',
    priority: 80,
    chip: '睡眠不足',
    message: pick(
      [
        `睡眠が3日続けて6時間を切っています(平均${avg.toFixed(1)}時間)。`,
        `3日連続の短い睡眠(平均${avg.toFixed(1)}時間)。からだが休めていません。`,
        `平均${avg.toFixed(1)}時間の睡眠が3日。体重計の数字より、まずこちらが心配です。`,
      ],
      seed,
    ),
    detail:
      '寝不足は食欲ホルモンを乱し、水分も溜め込みやすくします。体重が思うように動かない原因が、実はここにあることは珍しくありません。今夜は30分だけ早くベッドへ。',
  };
}

/** 睡眠不足のあと、眠れるようになった(開いたイベントを閉じる)。 */
function sleepRecovered(sleep: DailyPoint[], seed: number): BriefFinding | null {
  if (sleep.length < 7) return null;
  const today = todayISO();
  const recent = lastDays(sleep, 3, today);
  const prior = lastDays(sleep, 4, addDays(today, -3));
  if (recent.length < 3 || prior.length < 3) return null;
  const wasShort = prior.filter((p) => p.value < 6).length >= 2;
  const nowFine = recent.every((p) => p.value >= 6.5);
  if (!wasShort || !nowFine) return null;
  const avg = mean(recent.map((p) => p.value))!;
  return {
    kind: 'sleep-recovered',
    priority: 54,
    chip: '睡眠回復',
    message: pick(
      [
        `睡眠が戻ってきました(直近3日の平均${avg.toFixed(1)}時間)。`,
        `ここ3日はしっかり眠れています(平均${avg.toFixed(1)}時間)。いい流れです。`,
      ],
      seed,
    ),
    detail: '睡眠が戻ると、むくみが抜けて体重のブレも小さくなります。トレンドが読みやすい時期です。',
  };
}

/** 安静時心拍が本人のベースラインより高止まりしている。 */
function heartElevated(heart: DailyPoint[], seed: number): BriefFinding | null {
  if (heart.length < 14) return null;
  const today = todayISO();
  const recent = lastDays(heart, 3, today);
  const baselineWindow = lastDays(heart, 30, addDays(today, -3));
  if (recent.length < 2 || baselineWindow.length < 10) return null;
  const recentAvg = mean(recent.map((p) => p.value))!;
  const baseline = mean(baselineWindow.map((p) => p.value))!;
  const diff = recentAvg - baseline;
  if (diff < 4) return null;
  return {
    kind: 'heart-elevated',
    priority: 75,
    chip: '心拍高め',
    message: pick(
      [
        `安静時心拍がいつもより${Math.round(diff)}bpm高めです(${Math.round(recentAvg)}bpm)。`,
        `安静時心拍が${Math.round(recentAvg)}bpm。あなたの平常値より${Math.round(diff)}bpm上です。`,
        `いつもは${Math.round(baseline)}bpmのところ、ここ数日は${Math.round(recentAvg)}bpm。からだが少し頑張っています。`,
      ],
      seed,
    ),
    detail:
      '睡眠不足・疲労・ストレス・飲酒のあと、体調を崩す前ぶれにも上がります。まずは休息を優先してみてください。高い状態が1週間以上続く、あるいは体調が悪いときは医療機関に相談を。',
  };
}

/** 心拍がベースラインに戻った(開いたイベントを閉じる)。 */
function heartRecovered(heart: DailyPoint[], seed: number): BriefFinding | null {
  if (heart.length < 20) return null;
  const today = todayISO();
  const recent = lastDays(heart, 3, today);
  const prior = lastDays(heart, 4, addDays(today, -3));
  const baselineWindow = lastDays(heart, 30, addDays(today, -7));
  if (recent.length < 2 || prior.length < 2 || baselineWindow.length < 10) return null;
  const recentAvg = mean(recent.map((p) => p.value))!;
  const priorAvg = mean(prior.map((p) => p.value))!;
  const baseline = mean(baselineWindow.map((p) => p.value))!;
  if (priorAvg - baseline < 4) return null; // そもそも上がっていなかった
  if (recentAvg - baseline >= 2) return null; // まだ戻っていない
  return {
    kind: 'heart-recovered',
    priority: 56,
    chip: '心拍回復',
    message: pick(
      [
        `高めだった安静時心拍が、いつもの${Math.round(recentAvg)}bpmに戻りました。`,
        `安静時心拍が平常値に戻っています(${Math.round(recentAvg)}bpm)。からだが回復したようです。`,
      ],
      seed,
    ),
    detail: '休めたサインです。ここから活動量を戻していって大丈夫です。',
  };
}

// --- ルール: 生活のリズム ------------------------------------------------------

/** 昨日たくさん歩いた / 週平均が上がった / 下がってきている。 */
function stepsChange(stepsSeries: DailyPoint[], seed: number): BriefFinding | null {
  if (stepsSeries.length < 14) return null;
  const today = todayISO();
  const last = lastValue(stepsSeries)!;
  const isFreshEnough = dayIndex(today) - dayIndex(last.date) <= 1;
  const base = mean(lastDays(stepsSeries, 7, addDays(last.date, -1)).map((p) => p.value));

  if (isFreshEnough && base != null && last.value > base * 1.5 && last.value > 8000) {
    return {
      kind: 'steps-surge',
      priority: 60,
      chip: 'よく歩いた',
      message: pick(
        [
          `${steps(last.value)}、いつもの1.5倍以上歩きました。`,
          `よく歩いた日でした(${steps(last.value)})。`,
          `${steps(last.value)}。ふだんの${(last.value / base).toFixed(1)}倍です。`,
        ],
        seed,
      ),
      detail:
        'よく歩いた翌朝は、筋肉が水分を溜めて体重が一時的に増えることがあります。増えていても気にしないでください。効いてくるのは数日後です。',
    };
  }

  const thisWeek = mean(lastDays(stepsSeries, 7, today).map((p) => p.value));
  const prevWeek = mean(lastDays(stepsSeries, 14, addDays(today, -7)).map((p) => p.value));
  if (thisWeek == null || prevWeek == null || prevWeek <= 0) return null;

  if (thisWeek > prevWeek * 1.2 && thisWeek > 6000) {
    return {
      kind: 'steps-rise',
      priority: 52,
      chip: '歩数増',
      message: pick(
        [
          `今週はよく動いています(1日平均${steps(thisWeek)}、先週より${Math.round((thisWeek / prevWeek - 1) * 100)}%増)。`,
          `歩数が先週より${Math.round((thisWeek / prevWeek - 1) * 100)}%増えました(1日平均${steps(thisWeek)})。`,
        ],
        seed,
      ),
      detail: '活動量の変化は、数日〜1週間ほど遅れて体重トレンドに現れます。',
    };
  }

  if (thisWeek < prevWeek * 0.75) {
    return {
      kind: 'steps-decline',
      priority: 50,
      chip: '歩数減',
      message: pick(
        [
          `今週の歩数が先週より${Math.round((1 - thisWeek / prevWeek) * 100)}%減っています。`,
          `歩数が落ちています(1日平均${steps(thisWeek)}、先週比${Math.round((1 - thisWeek / prevWeek) * 100)}%減)。`,
        ],
        seed,
      ),
      detail: '天気や仕事の都合もあります。1駅歩く・昼に10分散歩、くらいの小さな一歩で十分戻せます。',
    };
  }
  return null;
}

// --- ルール: 計測の習慣 --------------------------------------------------------

/** 7日たまってトレンドが出せるようになった瞬間(最初の「効いた」体験)。 */
function dataReady(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 7 || weight.length > 8) return null; // 到達した直後だけ
  const smoothed = ewma(weight, 7);
  const trendNow = smoothed[smoothed.length - 1].value;
  return {
    kind: 'data-ready',
    priority: 68,
    chip: '準備完了',
    message: pick(
      [
        `7日分の計測がたまりました。今日からトレンド体重(${kg(trendNow)})が使えます。`,
        `データが7日分に到達。ノイズをならしたトレンド体重は${kg(trendNow)}です。`,
      ],
      seed,
    ),
    detail:
      'ここからが本番です。日々の上下ではなく、このトレンドの向きだけを見ていれば大丈夫です。',
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
        message: pick(
          [
            `体重計測が${gap}日空いています。`,
            `${gap}日ぶりですね。おかえりなさい。`,
            `計測が${gap}日とんでいます。トレンドが少しぼやけてきました。`,
          ],
          seed,
        ),
        detail:
          '完璧である必要はありません。今日1回乗るだけでトレンドの精度は戻ります。責めるためのアプリではないので、気楽に。',
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
  const weeks = streak / 7;
  return {
    kind: 'adherence-praise',
    priority: 55,
    chip: '継続中',
    message: pick(
      [
        `毎朝の計測が${streak}日続いています。継続は分析の土台、すばらしい習慣です。`,
        `計測ストリーク${streak}日目。データが溜まるほどトレンドの精度が上がります。`,
        `${weeks}週間、毎朝ちゃんと乗っています。この習慣そのものが成果です。`,
      ],
      seed,
    ),
    detail: '計測が途切れないほど、トレンドはノイズに強くなります。',
  };
}

/** 数日間、睡眠が記録されていない(スマートウォッチの着け忘れ・充電切れ)。 */
function sleepGap(sleep: DailyPoint[], seed: number): BriefFinding | null {
  if (sleep.length < 5) return null; // 普段から計測している人にだけ意味がある
  const last = sleep[sleep.length - 1];
  const gap = dayIndex(todayISO()) - dayIndex(last.date);
  if (gap < 2) return null;
  return {
    kind: 'sleep-gap',
    priority: 58,
    chip: '睡眠未計測',
    message: pick(
      [
        `睡眠が${gap}日計測できていません。`,
        `${gap}日ぶん、睡眠の記録が空いています。`,
      ],
      seed,
    ),
    detail:
      'スマートウォッチの充電と装着を確認してみてください。睡眠は体重の動きを説明する重要なピースです。',
  };
}

// --- ルール: 発見 --------------------------------------------------------------

/**
 * 体重は変わらないのに体脂肪率が落ちている = 中身が入れ替わっている。
 * 体重計の数字だけ見ていると「停滞」に見える時期に、本当は最も報われている
 * ことを伝えられる。スマート体重計を持つユーザーだけの特典。
 */
function bodyRecomposition(
  weight: DailyPoint[],
  bodyFat: DailyPoint[] | undefined,
  seed: number,
): BriefFinding | null {
  if (!bodyFat || bodyFat.length < 14) return null;
  const today = todayISO();
  const fat28 = lastDays(bodyFat, 28, today);
  if (fat28.length < 12) return null;
  const fatTrend = linearTrend(fat28);
  if (!fatTrend || fatTrend.slopePerWeek == null) return null;
  if (fatTrend.slopePerWeek > -0.1) return null; // 体脂肪率が落ちていない
  // 家庭用体重計の体脂肪率は測定ノイズが大きい。当てはまりの悪い回帰を根拠に
  // 「中身が変わっています」と断言してはいけない
  if (fatTrend.r2 < 0.25) return null;

  const insight = weightInsight(weight);
  if (insight.slopePerWeek == null) return null;
  if (Math.abs(insight.slopePerWeek) >= FLAT_PER_WEEK) return null; // 体重が動いていたら「停滞」の話ではない

  const dropIn4w = Math.abs(fatTrend.slopePerWeek) * 4;
  const latestFat = lastValue(fat28)!;
  return {
    kind: 'body-recomposition',
    priority: 46,
    chip: '中身が変化',
    message: pick(
      [
        `体重はほぼ横ばいですが、体脂肪率はこの4週間で約${dropIn4w.toFixed(1)}ポイント下がっています(現在${latestFat.value.toFixed(1)}%)。`,
        `数字は止まって見えても、中身は変わっています。体脂肪率は4週間で約${dropIn4w.toFixed(1)}ポイント減(現在${latestFat.value.toFixed(1)}%)。`,
      ],
      seed,
    ),
    detail:
      '脂肪が減って筋肉が増えると、体重は変わらないまま体は引き締まります。体重計だけを見ていたら「停滞」に見える、いちばん報われている時期かもしれません。',
  };
}

/**
 * 曜日のリズム(週末に増えて週半ばに戻る、など)。トレンドからの乖離で見るので、
 * 長期の増減には引きずられない。
 *
 * **「あなたが最も重く出る曜日」の朝にだけ**言う。金曜に「月曜は重い」と言われても
 * 価値はないが、月曜の朝に「今日は重く出る日です」と先回りできれば、体重計を見て
 * がっかりする前に効く。週1回しか出ないので、ヘッドラインの占拠も起きない。
 */
function weekdayPattern(weight: DailyPoint[], seed: number): BriefFinding | null {
  if (weight.length < 42) return null;
  const smoothed = ewma(weight, 7);
  const trendByDate = new Map(smoothed.map((p) => [p.date, p.value]));

  // 曜日ごとに「トレンドからの乖離」を集める(絶対値ではなく乖離を見るので、
  // 長期の増減トレンドに引きずられない)
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const p of weight.slice(-84)) {
    const t = trendByDate.get(p.date);
    if (t == null) continue;
    buckets[fromISODate(p.date).getDay()].push(p.value - t);
  }

  const usable = buckets
    .map((vals, wd) => ({ wd, n: vals.length, avg: mean(vals) }))
    .filter((s): s is { wd: number; n: number; avg: number } => s.n >= 4 && s.avg != null);
  if (usable.length < 5) return null;

  const high = usable.reduce((a, b) => (b.avg > a.avg ? b : a));
  const low = usable.reduce((a, b) => (b.avg < a.avg ? b : a));
  const spread = high.avg - low.avg;
  if (spread < 0.3) return null;
  // 重く出る曜日の朝にだけ言う(それ以外の日に言っても行動が変わらない)
  if (fromISODate(todayISO()).getDay() !== high.wd) return null;

  const NAMES = ['日', '月', '火', '水', '木', '金', '土'];
  const excess = high.avg > 0 ? high.avg : spread / 2;
  return {
    kind: 'weekday-pattern',
    priority: 64,
    chip: '重い曜日',
    message: pick(
      [
        `今日は${NAMES[high.wd]}曜。あなたの体重が週でいちばん重く出やすい日です(平均で${NAMES[low.wd]}曜より${spread.toFixed(1)}kg重い)。`,
        `${NAMES[high.wd]}曜の朝です。過去のデータでは、この曜日はトレンドより${signed(excess)}kgほど高く出ています。`,
        `今日の数字は少し重めに出るかもしれません。${NAMES[high.wd]}曜はあなたにとってそういう日です(${NAMES[low.wd]}曜との差は約${spread.toFixed(1)}kg)。`,
      ],
      seed,
    ),
    detail: `週末や前日の食事・塩分の影響は、翌朝の数字に出ます。${NAMES[high.wd]}曜に重いこと自体は問題ではありません。今日の数字ではなく、トレンドの向きだけ見ておけば大丈夫です。`,
  };
}

/** 週1回(日曜)の相関の小ネタ。確かな信号があるときだけ。 */
function correlation(
  weight: DailyPoint[],
  stepsSeries: DailyPoint[],
  seed: number,
): BriefFinding | null {
  if (new Date().getDay() !== 0) return null; // 日曜=振り返りの日
  const best = stepsWeightLink(weight, stepsSeries, 21); // 通常より多めのペア数を要求
  if (!best || Math.abs(best.r) < 0.3) return null;
  const negative = best.r < 0;
  const direction = negative ? '減りやすい' : '増えやすい';
  // ラグは1以上(体重は歩く前の朝に測るため。insights.ts の stepsWeightLink 参照)
  const lagText = best.lagDays === 1 ? '翌朝' : `${best.lagDays}日後`;
  return {
    kind: 'correlation',
    priority: 45,
    chip: '発見',
    message: pick(
      [
        `あなたのデータでは、よく歩いた日の${lagText}に体重が${direction}傾向があります(r=${best.r.toFixed(2)})。`,
        `歩数と体重の関係を調べました。よく歩いた${lagText}、体重は${direction}ようです(r=${best.r.toFixed(2)})。`,
      ],
      seed,
    ),
    detail: negative
      ? '相関は因果ではありませんが、あなたにとって歩くことが効いている可能性は高そうです。'
      : '意外に見えますが、よく歩いた翌日は筋肉が水分を溜めて一時的に増えることがあります。悪い兆候ではありません。',
  };
}

// --- フォールバック ------------------------------------------------------------

/** 常に生成できる現状報告。何も特筆すべきことがない日の「淡々とした報告」。 */
function status(series: BriefSeries, seed: number): BriefFinding {
  const insight = weightInsight(series.weight);
  if (insight.trendWeight != null && insight.slopePerWeek != null) {
    const pace = assessPace(insight.slopePerWeek);
    const stable = pace === 'stable';
    const paceText = stable
      ? '安定しています'
      : `週${signed(insight.slopePerWeek, 2)}kgで${insight.slopePerWeek < 0 ? '減少' : '増加'}中です`;
    return {
      kind: 'status',
      priority: 10,
      chip: stable ? '安定' : '順調',
      message: pick(
        [
          `トレンド体重は${kg(insight.trendWeight)}、${paceText}。`,
          `ならした体重は${kg(insight.trendWeight)}。${paceText}。`,
          `今日は特筆すべき変化はありません。トレンド体重${kg(insight.trendWeight)}、${paceText}。`,
          `${kg(insight.trendWeight)}。${paceText}。今日も淡々と。`,
        ],
        seed,
      ),
      detail: '変化のない日は、うまくいっている日です。続けることそのものが効いています。',
    };
  }
  // ここに来るのは「トレンドを出せるだけの新しいデータがない」ケース。
  // 計測回数だけで文面を決めると、昔たくさん測ってやめた人に「あと-13日」などと
  // 言ってしまうので、直近28日に何日ぶんあるかで判断する
  const last28 = lastDays(series.weight, 28, todayISO()).length;
  if (series.weight.length === 0) {
    return {
      kind: 'status',
      priority: 10,
      chip: 'はじめの一歩',
      message: 'まだ体重の記録がありません。まずは明日の朝、体重計に乗ってみてください。',
      detail:
        '7日分あれば、日々の上下(水分の揺れ)と本当の変化を切り分けられるようになります。それまではただ乗るだけで十分です。',
    };
  }
  if (last28 === 0) {
    return {
      kind: 'status',
      priority: 10,
      chip: 'おかえり',
      message: 'しばらく計測が空いています。今朝から、また一緒に見ていきましょう。',
      detail: '過去のデータは残っています。数日乗ればトレンドはすぐ戻ってきます。',
    };
  }
  return {
    kind: 'status',
    priority: 10,
    chip: 'はじめの一歩',
    message: `計測${last28}日目。あと${Math.max(1, 7 - last28)}日ぶんたまると、ノイズをならしたトレンドが見えてきます。`,
    detail:
      '7日分あれば、日々の上下(水分の揺れ)と本当の変化を切り分けられるようになります。それまではただ乗るだけで十分です。',
  };
}

// --- 組み立て ----------------------------------------------------------------

const MAX_ITEMS = 3;
/** 数日前にヘッドラインだった種類への減点(除外はしないが、他に譲る) */
const STALE_PENALTY = 15;

export interface BriefOptions {
  /** 昨日ヘッドラインだった種類。今日はヘッドラインにしない(itemsには残る) */
  yesterdayKind?: BriefKind | null;
  /** 2〜3日前にヘッドラインだった種類。除外はせず減点する(同点なら他に譲る) */
  staleKinds?: BriefKind[];
  /** 言い回しローテーションのシード。既定は今日の日付 */
  seed?: number;
}

export function buildDailyBrief(series: BriefSeries, options?: BriefOptions): DailyBrief {
  const seed = options?.seed ?? dayIndex(todayISO());
  const yesterday = options?.yesterdayKind ?? null;
  const olderRecent = new Set(options?.staleKinds ?? []);

  const ranked = [
    // 今朝の解釈
    weightSuspect(series.weight, seed),
    weightNoiseResolved(series.weight, seed),
    weightNoise(series.weight, seed),
    // トレンドの節目
    weightPlateauBreak(series.weight, seed),
    weightPlateau(series.weight, seed),
    weightNewLow(series.weight, seed),
    weightStreak(series.weight, seed),
    weightPaceFast(series.weight, seed),
    // からだの変化
    sleepDeficit(series.sleep, seed),
    sleepRecovered(series.sleep, seed),
    heartElevated(series.restingHeartRate, seed),
    heartRecovered(series.restingHeartRate, seed),
    // 生活のリズム
    stepsChange(series.steps, seed),
    // 計測の習慣
    dataReady(series.weight, seed),
    adherence(series.weight, seed),
    sleepGap(series.sleep, seed),
    // 発見
    bodyRecomposition(series.weight, series.bodyFat, seed),
    weekdayPattern(series.weight, seed),
    correlation(series.weight, series.steps, seed),
  ]
    .filter((f): f is BriefFinding => f !== null)
    // 数日前にヘッドラインにした話題は、同じ強さなら他に譲る(除外はしない)
    .map((f) => (olderRecent.has(f.kind) ? { ...f, priority: f.priority - STALE_PENALTY } : f))
    .sort((a, b) => b.priority - a.priority);

  // 昨日ヘッドラインだった種類は今日はヘッドラインにしない(itemsには残る)。
  // 他に目立つ所見がなければ現状報告(status)が引き継ぐ。
  const headline = ranked.find((f) => f.kind !== yesterday) ?? status(series, seed);
  const items = ranked.filter((f) => f !== headline).slice(0, MAX_ITEMS);
  return { headline, items };
}
