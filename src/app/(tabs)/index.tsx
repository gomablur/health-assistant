import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { weightInsight } from '@/analytics/insights';
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
import { todayISO } from '@/utils/date';
import { formatValue } from '@/utils/format';

const KIND_ICON: Record<BriefKind, string> = {
  'weight-noise': '🌊',
  'weight-streak': '📈',
  'weight-pace-fast': '⚠️',
  'adherence-praise': '🔥',
  'adherence-gap': '📆',
  'sleep-deficit': '😴',
  'heart-elevated': '💗',
  'steps-surge': '👟',
  'steps-decline': '👟',
  correlation: '🔍',
  status: '🧭',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'こんばんは';
}

function MiniStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | null;
  unit: string;
}) {
  return (
    <View style={styles.miniStat}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <View style={styles.miniValueRow}>
        <ThemedText type="smallBold" style={styles.miniValue}>
          {value ?? '—'}
        </ThemedText>
        {value != null && (
          <ThemedText type="small" themeColor="textMuted">
            {unit}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function latest(points: DailyPoint[] | null): number | null {
  return points && points.length > 0 ? points[points.length - 1].value : null;
}

export default function HomeScreen() {
  const { brief, loading } = useDailyBrief();

  const weight = useHealthDaily('weight', 30);
  const steps = useHealthDaily('steps', 7);
  const sleep = useHealthDaily('sleep', 7);
  const heart = useHealthDaily('restingHeartRate', 7);

  const raw = weight.data ?? [];
  const smoothed = movingAverage(raw, 7);
  const insight = weightInsight(raw);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 (${'日月火水木金土'[today.getDay()]})`;
  const stepsToday =
    steps.data && steps.data.length > 0 && steps.data[steps.data.length - 1].date === todayISO()
      ? steps.data[steps.data.length - 1].value
      : null;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">{greeting()}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {dateLabel}
        </ThemedText>
      </View>

      {/* 今日のひとこと — the reason this app exists */}
      <Card style={styles.heroCard}>
        {brief ? (
          <>
            <ThemedText style={styles.heroText}>
              {KIND_ICON[brief.headline.kind]} {brief.headline.message}
            </ThemedText>
            {brief.headline.detail && (
              <ThemedText type="small" themeColor="textSecondary">
                {brief.headline.detail}
              </ThemedText>
            )}
          </>
        ) : (
          <ThemedText type="small" themeColor="textMuted">
            {loading ? 'データを分析しています…' : 'データがまだありません'}
          </ThemedText>
        )}
      </Card>

      {brief && brief.items.length > 0 && (
        <Card>
          <CardTitle>ほかの気づき</CardTitle>
          {brief.items.map((item) => (
            <View key={item.kind} style={styles.itemRow}>
              <ThemedText style={styles.itemIcon}>{KIND_ICON[item.kind]}</ThemedText>
              <View style={styles.itemText}>
                <ThemedText type="small">{item.message}</ThemedText>
                {item.detail && (
                  <ThemedText type="small" themeColor="textMuted">
                    {item.detail}
                  </ThemedText>
                )}
              </View>
            </View>
          ))}
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
          <MiniStat label="体重" value={formatValue(insight.latest?.value, 1)} unit="kg" />
          <MiniStat label="今日の歩数" value={formatValue(stepsToday, 0)} unit="歩" />
          <MiniStat label="昨夜の睡眠" value={formatValue(latest(sleep.data), 1)} unit="h" />
          <MiniStat label="安静時心拍" value={formatValue(latest(heart.data), 0)} unit="bpm" />
        </View>
      </Card>

      {isMockSource() && (
        <ThemedText type="small" themeColor="textMuted" style={styles.mockNote}>
          🧪 モックデータ表示中(実機ではヘルスケア / Health Connect のデータになります)
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.half,
  },
  heroCard: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  heroText: {
    fontSize: 20,
    lineHeight: 31,
    fontWeight: 600,
  },
  itemRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  itemIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
  itemText: {
    flex: 1,
    gap: 2,
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
  mockNote: {
    textAlign: 'center',
  },
});
