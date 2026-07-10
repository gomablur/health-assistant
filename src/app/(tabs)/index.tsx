import { StyleSheet, View } from 'react-native';

import { assessPace, PACE_LABEL, weightInsight } from '@/analytics/insights';
import { Card, CardTitle } from '@/components/card';
import { Screen } from '@/components/screen';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { isMockSource } from '@/health';
import type { DailyPoint } from '@/health/types';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { formatValue, round1 } from '@/utils/format';
import { todayISO } from '@/utils/date';

function latestOf(points: DailyPoint[] | null): DailyPoint | null {
  return points && points.length > 0 ? points[points.length - 1] : null;
}

function avg(points: DailyPoint[] | null, days: number): number | null {
  if (!points) return null;
  const cutoff = todayISO();
  const recent = points.filter((p) => p.date <= cutoff).slice(-days);
  if (recent.length === 0) return null;
  return recent.reduce((a, p) => a + p.value, 0) / recent.length;
}

export default function DashboardScreen() {
  const theme = useTheme();
  const weight = useHealthDaily('weight', 35);
  const steps = useHealthDaily('steps', 14);
  const sleep = useHealthDaily('sleep', 14);
  const heart = useHealthDaily('restingHeartRate', 30);

  const insight = weightInsight(weight.data ?? []);
  const pace = insight.slopePerWeek != null ? assessPace(insight.slopePerWeek) : null;

  const stepsToday = latestOf(steps.data);
  const stepsAvg = avg(steps.data, 7);
  const sleepLast = latestOf(sleep.data);
  const sleepAvg = avg(sleep.data, 7);
  const heartLast = latestOf(heart.data);
  const heartAvg = avg(heart.data, 7);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 (${'日月火水木金土'[today.getDay()]})`;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">こんにちは</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {dateLabel}
        </ThemedText>
      </View>

      {isMockSource() && (
        <Card style={{ borderColor: theme.axis }}>
          <ThemedText type="small" themeColor="textSecondary">
            🧪 モックデータを表示中です。実機ではヘルスケア / Health Connect のデータが表示されます。
          </ThemedText>
        </Card>
      )}

      <View style={styles.grid}>
        <StatTile
          label="体重"
          value={formatValue(insight.latest?.value, 1)}
          unit="kg"
          delta={
            insight.avg7 != null && insight.prevAvg7 != null
              ? {
                  value: round1(insight.avg7 - insight.prevAvg7),
                  suffix: 'kg',
                  vs: '前週比',
                  upIsGood: false,
                }
              : null
          }
          trend={weight.data ?? undefined}
          accent={theme.seriesWeight}
        />
        <StatTile
          label="今日の歩数"
          value={
            stepsToday && stepsToday.date === todayISO() ? formatValue(stepsToday.value, 0) : null
          }
          unit="歩"
          delta={
            stepsToday && stepsAvg != null
              ? {
                  value: Math.round(stepsToday.value - stepsAvg),
                  vs: '7日平均比',
                  upIsGood: true,
                }
              : null
          }
          trend={steps.data ?? undefined}
          accent={theme.seriesSteps}
        />
        <StatTile
          label="昨夜の睡眠"
          value={formatValue(sleepLast?.value, 1)}
          unit="時間"
          delta={
            sleepLast && sleepAvg != null
              ? {
                  value: round1(sleepLast.value - sleepAvg),
                  suffix: 'h',
                  vs: '7日平均比',
                  upIsGood: true,
                }
              : null
          }
          trend={sleep.data ?? undefined}
          accent={theme.seriesSleep}
        />
        <StatTile
          label="安静時心拍"
          value={formatValue(heartLast?.value, 0)}
          unit="bpm"
          delta={
            heartLast && heartAvg != null
              ? {
                  value: Math.round(heartLast.value - heartAvg),
                  vs: '7日平均比',
                  upIsGood: false,
                }
              : null
          }
          trend={heart.data ?? undefined}
          accent={theme.seriesHeart}
        />
      </View>

      {pace && insight.slopePerWeek != null && (
        <Card>
          <CardTitle hint="直近28日の傾向">体重トレンド</CardTitle>
          <ThemedText>
            {PACE_LABEL[pace]}(週{insight.slopePerWeek >= 0 ? '+' : ''}
            {insight.slopePerWeek.toFixed(2)} kg ペース)
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            日々の増減は水分などのノイズです。移動平均のトレンドで判断しましょう。詳しくは「体重」タブへ。
          </ThemedText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.half,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
