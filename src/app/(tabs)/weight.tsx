import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { assessPace, PACE_LABEL, stepsWeightLink, weightInsight } from '@/analytics/insights';
import { movingAverage } from '@/analytics/stats';
import { Card, CardTitle } from '@/components/card';
import { WeightTrendChart } from '@/components/charts/weight-trend-chart';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { formatValue } from '@/utils/format';

const PERIODS = [
  { label: '1ヶ月', value: 30 },
  { label: '3ヶ月', value: 90 },
  { label: '1年', value: 365 },
] as const;

function describeCorrelation(r: number): string {
  const strength = Math.abs(r) >= 0.5 ? 'はっきりした' : Math.abs(r) >= 0.25 ? 'ゆるやかな' : '弱い';
  const direction = r < 0 ? 'よく歩いた日ほど体重が減りやすい' : 'よく歩いた日ほど体重が増えやすい';
  return `${strength}傾向: ${direction}`;
}

export default function WeightScreen() {
  const theme = useTheme();
  const [days, setDays] = useState<number>(90);
  const weight = useHealthDaily('weight', days);
  const steps = useHealthDaily('steps', days);

  const raw = weight.data ?? [];
  const smoothed = movingAverage(raw, 7);
  const insight = weightInsight(raw);
  const pace = insight.slopePerWeek != null ? assessPace(insight.slopePerWeek) : null;
  const link =
    weight.data && steps.data && days >= 90 ? stepsWeightLink(weight.data, steps.data) : null;
  const adherencePct = Math.round(insight.adherence28 * 100);

  return (
    <Screen>
      <Segmented options={[...PERIODS]} value={days} onChange={setDays} />

      <Card>
        <CardTitle hint="kg">体重の推移</CardTitle>
        <WeightTrendChart raw={raw} smoothed={smoothed} />
      </Card>

      <View style={styles.row}>
        <StatTile
          label="トレンド体重"
          value={formatValue(insight.trendWeight, 1)}
          unit="kg"
          delta={
            insight.latest && insight.trendWeight != null
              ? {
                  value: Math.round((insight.latest.value - insight.trendWeight) * 10) / 10,
                  suffix: 'kg',
                  vs: '実測との差',
                  upIsGood: false,
                }
              : null
          }
        />
        <StatTile
          label="変化ペース"
          value={
            insight.slopePerWeek != null
              ? `${insight.slopePerWeek >= 0 ? '+' : ''}${insight.slopePerWeek.toFixed(2)}`
              : null
          }
          unit="kg/週"
        />
      </View>

      {pace && (
        <Card>
          <CardTitle hint="直近28日">ペース判定</CardTitle>
          <ThemedText>{PACE_LABEL[pace]}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {pace === 'losing-fast' || pace === 'gaining-fast'
              ? '週0.5kgを超える変化は体への負担が大きめです。食事と睡眠を見直してみましょう。'
              : pace === 'stable'
                ? '体重は安定しています。この調子で計測を続けましょう。'
                : '健康的な範囲のペースです(目安: 週±0.5kg以内)。'}
          </ThemedText>
        </Card>
      )}

      <Card>
        <CardTitle hint="直近28日">計測の継続率</CardTitle>
        <View style={styles.meterRow}>
          <View style={[styles.meterTrack, { backgroundColor: theme.backgroundElement }]}>
            <View
              style={[
                styles.meterFill,
                { backgroundColor: theme.tint, width: `${adherencePct}%` },
              ]}
            />
          </View>
          <ThemedText type="smallBold">{adherencePct}%</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          毎朝の計測が続くほど、トレンドの精度が上がります。
        </ThemedText>
      </Card>

      {link && (
        <Card>
          <CardTitle hint={`相関係数 r=${link.r.toFixed(2)} / n=${link.n}`}>
            歩数と体重変化の関係
          </CardTitle>
          <ThemedText>
            {describeCorrelation(link.r)}
            {link.lagDays > 0 ? `(${link.lagDays}日後に反映される傾向)` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            相関は因果関係を保証するものではありませんが、生活のヒントになります。
          </ThemedText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  meterTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
});
