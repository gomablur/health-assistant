import { StyleSheet, View } from 'react-native';

import { weekOverWeek } from '@/analytics/insights';
import { Card, CardTitle } from '@/components/card';
import { DailyBarChart } from '@/components/charts/daily-bar-chart';
import { Screen } from '@/components/screen';
import { StatTile } from '@/components/stat-tile';
import { Spacing } from '@/constants/theme';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { formatValue, round1 } from '@/utils/format';

export default function ActivityScreen() {
  const theme = useTheme();
  const steps = useHealthDaily('steps', 30);
  const sleep = useHealthDaily('sleep', 30);
  const energy = useHealthDaily('activeEnergy', 30);
  const heart = useHealthDaily('restingHeartRate', 30);

  const stepsWow = weekOverWeek(steps.data ?? []);
  const sleepWow = weekOverWeek(sleep.data ?? []);
  const energyWow = weekOverWeek(energy.data ?? []);
  const heartWow = weekOverWeek(heart.data ?? []);

  return (
    <Screen>
      <View style={styles.row}>
        <StatTile
          label="歩数 (7日平均)"
          value={formatValue(stepsWow.avg7, 0)}
          unit="歩"
          delta={
            stepsWow.avg7 != null && stepsWow.prevAvg7 != null
              ? {
                  value: Math.round(stepsWow.avg7 - stepsWow.prevAvg7),
                  vs: '前週比',
                  upIsGood: true,
                }
              : null
          }
        />
        <StatTile
          label="睡眠 (7日平均)"
          value={formatValue(sleepWow.avg7, 1)}
          unit="時間"
          delta={
            sleepWow.avg7 != null && sleepWow.prevAvg7 != null
              ? {
                  value: round1(sleepWow.avg7 - sleepWow.prevAvg7),
                  suffix: 'h',
                  vs: '前週比',
                  upIsGood: true,
                }
              : null
          }
        />
      </View>
      <View style={styles.row}>
        <StatTile
          label="アクティブカロリー (7日平均)"
          value={formatValue(energyWow.avg7, 0)}
          unit="kcal"
          delta={
            energyWow.avg7 != null && energyWow.prevAvg7 != null
              ? {
                  value: Math.round(energyWow.avg7 - energyWow.prevAvg7),
                  vs: '前週比',
                  upIsGood: true,
                }
              : null
          }
        />
        <StatTile
          label="安静時心拍 (7日平均)"
          value={formatValue(heartWow.avg7, 0)}
          unit="bpm"
          delta={
            heartWow.avg7 != null && heartWow.prevAvg7 != null
              ? {
                  value: Math.round(heartWow.avg7 - heartWow.prevAvg7),
                  vs: '前週比',
                  upIsGood: false,
                }
              : null
          }
          trend={heart.data ?? undefined}
          accent={theme.seriesHeart}
        />
      </View>

      <Card>
        <CardTitle hint="直近14日">歩数</CardTitle>
        <DailyBarChart points={steps.data ?? []} days={14} color={theme.seriesSteps} unit="歩" />
      </Card>

      <Card>
        <CardTitle hint="直近14日">睡眠時間</CardTitle>
        <DailyBarChart
          points={sleep.data ?? []}
          days={14}
          color={theme.seriesSleep}
          unit="時間"
          digits={1}
          height={140}
        />
      </Card>

      <Card>
        <CardTitle hint="直近14日">アクティブカロリー</CardTitle>
        <DailyBarChart
          points={energy.data ?? []}
          days={14}
          color={theme.seriesEnergy}
          unit="kcal"
          height={140}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
