import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { assessPace, weightInsight, type Pace } from '@/analytics/insights';
import { movingAverage } from '@/analytics/stats';
import { Card, CardTitle } from '@/components/card';
import { WeightTrendChart } from '@/components/charts/weight-trend-chart';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import type { BriefKind } from '@/coach/briefing';
import { useDailyBrief } from '@/coach/useDailyBrief';
import { Spacing } from '@/constants/theme';
import { isMockSource } from '@/health';
import type { DailyPoint } from '@/health/types';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { addDays, dayIndex, todayISO } from '@/utils/date';
import { formatValue } from '@/utils/format';

/**
 * ホーム画面(語りかけ型の入口)。構成は上から:
 * 1. ヒーロー: トレンド体重の大きな数字+方向矢印+ペースピル
 * 2. 今日のブリーフ: ヘッドライン1行+所見チップ(タップで展開)
 * 3. 30日トレンドチャート、主要メトリクスのミニ統計
 * 数字タイル羅列(ヘルスケアアプリ風)にしないのが意図的な設計判断。
 */

const KIND_ICON: Record<BriefKind, string> = {
  // 今朝の解釈
  'weight-suspect': '❓',
  'weight-noise': '🌊',
  'weight-noise-resolved': '💨',
  // トレンドの節目
  'weight-plateau-break': '🎉',
  'weight-plateau': '🪨',
  'weight-new-low': '🏔️',
  'weight-streak': '📉',
  'weight-pace-fast': '⚠️',
  // からだの変化
  'sleep-deficit': '😴',
  'sleep-recovered': '🌙',
  'heart-elevated': '💗',
  'heart-recovered': '🫀',
  // 生活のリズム
  'steps-surge': '👟',
  'steps-rise': '🚶',
  'steps-decline': '🐢',
  // 計測の習慣
  'data-ready': '✨',
  'adherence-praise': '🔥',
  'adherence-gap': '📆',
  'sleep-gap': '⌚',
  // 発見
  'body-recomposition': '🔄',
  'weekday-pattern': '🗓️',
  correlation: '🔍',
  // フォールバック
  status: '🧭',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'こんばんは';
}

/** トレンド方向に応じたヒーローの矢印と色(このアプリでは減少が「良い方向」)。 */
function paceVisual(pace: Pace): { arrow: string; colorKey: 'deltaGood' | 'deltaBad' | 'textSecondary' } {
  switch (pace) {
    case 'losing':
      return { arrow: '↘', colorKey: 'deltaGood' };
    case 'losing-fast':
      return { arrow: '↘', colorKey: 'deltaBad' };
    case 'gaining':
    case 'gaining-fast':
      return { arrow: '↗', colorKey: 'deltaBad' };
    case 'stable':
      return { arrow: '→', colorKey: 'textSecondary' };
  }
}

/** 最終計測が十分新しい(今日から maxAgeDays 以内)場合のみその点を返す。古ければ「未計測」扱い。 */
function freshPoint(points: DailyPoint[] | null, maxAgeDays: number): DailyPoint | null {
  if (!points || points.length === 0) return null;
  const last = points[points.length - 1];
  return last.date >= addDays(todayISO(), -maxAgeDays) ? last : null;
}

/** 計測日の相対表記。「いつのデータかわからない」を防ぐためミニ統計に必ず添える。 */
function relativeDay(iso: string): string {
  const diff = dayIndex(todayISO()) - dayIndex(iso);
  if (diff <= 0) return '今日';
  if (diff === 1) return '昨日';
  return `${diff}日前`;
}

function MiniStat({
  label,
  value,
  unit,
  when,
}: {
  label: string;
  value: string | null;
  unit: string;
  /** 計測タイミングの表示(今日/昨日/N日前/昨夜)。未計測時は null */
  when: string | null;
}) {
  return (
    <View style={styles.miniStat}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <View style={styles.miniValueRow}>
        <ThemedText type="smallBold" style={styles.miniValue}>
          {value ?? '未計測'}
        </ThemedText>
        {value != null && (
          <ThemedText type="small" themeColor="textMuted">
            {unit}
          </ThemedText>
        )}
      </View>
      {value != null && when != null && (
        <ThemedText style={styles.miniWhen} themeColor="textMuted">
          {when}
        </ThemedText>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { brief } = useDailyBrief();
  const [expandedKind, setExpandedKind] = useState<BriefKind | null>(null);

  const weight = useHealthDaily('weight', 30);
  const steps = useHealthDaily('steps', 7);
  const sleep = useHealthDaily('sleep', 7);
  const heart = useHealthDaily('restingHeartRate', 7);

  const raw = weight.data ?? [];
  const smoothed = movingAverage(raw, 7);
  const insight = weightInsight(raw);
  const pace = insight.slopePerWeek != null ? assessPace(insight.slopePerWeek) : null;
  const visual = pace ? paceVisual(pace) : null;

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 (${'日月火水木金土'[today.getDay()]})`;

  // 鮮度条件: 睡眠は起床日に帰属するので「昨夜の睡眠」は今日の日付でなければならない。
  // 体重と心拍は計測日を明示する代わりに、多少古くても表示する
  const sleepLastNight = freshPoint(sleep.data, 0);
  const heartRecent = freshPoint(heart.data, 6);
  const stepsToday = freshPoint(steps.data, 0);

  const expanded = brief?.items.find((i) => i.kind === expandedKind) ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {greeting()} · {dateLabel}
        </ThemedText>
      </View>

      {/* ヒーロー: 今日の1つの数字と、ひと目でわかる方向 */}
      <View style={styles.hero}>
        <ThemedText type="small" themeColor="textMuted">
          トレンド体重
        </ThemedText>
        <View style={styles.heroRow}>
          <ThemedText style={styles.heroValue}>
            {formatValue(insight.trendWeight, 1) ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.heroUnit}>
            kg
          </ThemedText>
          {visual && (
            <ThemedText style={[styles.heroArrow, { color: theme[visual.colorKey] }]}>
              {visual.arrow}
            </ThemedText>
          )}
        </View>
        {insight.slopePerWeek != null && (
          <View style={[styles.pacePill, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              週{insight.slopePerWeek >= 0 ? '+' : ''}
              {insight.slopePerWeek.toFixed(2)}kg
            </ThemedText>
          </View>
        )}
        {brief && (
          <ThemedText style={styles.headline}>
            {KIND_ICON[brief.headline.kind]} {brief.headline.message}
          </ThemedText>
        )}
      </View>

      {/* 所見はチップで並べ、タップした1つだけ展開する */}
      {brief && brief.items.length > 0 && (
        <View style={styles.chipsWrap}>
          {brief.items.map((item) => {
            const selected = item.kind === expandedKind;
            return (
              <Pressable
                key={item.kind}
                accessibilityRole="button"
                accessibilityState={{ expanded: selected }}
                onPress={() => setExpandedKind(selected ? null : item.kind)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.backgroundSelected : theme.surface,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="small">
                  {KIND_ICON[item.kind]} {item.chip}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
      {expanded && (
        <Card>
          <ThemedText type="small">{expanded.message}</ThemedText>
          {expanded.detail && (
            <ThemedText type="small" themeColor="textSecondary">
              {expanded.detail}
            </ThemedText>
          )}
        </Card>
      )}

      <Card>
        <View style={styles.chartHeader}>
          <CardTitle hint="直近30日">体重トレンド</CardTitle>
          <Link href="/weight">
            <ThemedText type="linkPrimary">詳しく →</ThemedText>
          </Link>
        </View>
        <WeightTrendChart raw={raw} smoothed={smoothed} height={150} />
      </Card>

      <Card>
        <View style={styles.miniRow}>
          <MiniStat
            label="体重"
            value={formatValue(insight.latest?.value, 1)}
            unit="kg"
            when={insight.latest ? relativeDay(insight.latest.date) : null}
          />
          <MiniStat
            label="歩数"
            value={formatValue(stepsToday?.value, 0)}
            unit="歩"
            when={stepsToday ? '今日' : null}
          />
          <MiniStat
            label="睡眠"
            value={formatValue(sleepLastNight?.value, 1)}
            unit="h"
            when={sleepLastNight ? '昨夜' : null}
          />
          <MiniStat
            label="安静時心拍"
            value={formatValue(heartRecent?.value, 0)}
            unit="bpm"
            when={heartRecent ? relativeDay(heartRecent.date) : null}
          />
        </View>
      </Card>

      {isMockSource() && (
        <ThemedText type="small" themeColor="textMuted" style={styles.mockNote}>
          🧪 モックデータ表示中(実機ではヘルスケア / ヘルスコネクト のデータになります)
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.half,
  },
  hero: {
    alignItems: 'flex-start',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  heroValue: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: 700,
  },
  heroUnit: {
    fontSize: 18,
  },
  heroArrow: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: 700,
    marginLeft: Spacing.one,
  },
  pacePill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
  },
  headline: {
    marginTop: Spacing.two,
    fontSize: 15,
    lineHeight: 23,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: 6,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  miniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    justifyContent: 'space-between',
  },
  miniStat: {
    gap: 2,
    minWidth: 72,
  },
  miniValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  miniValue: {
    fontSize: 17,
  },
  miniWhen: {
    fontSize: 11,
    lineHeight: 14,
  },
  mockNote: {
    textAlign: 'center',
  },
});
