import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deriveFatMass, intakeGuide } from '@/analytics/body';
import { assessPace, PACE_LABEL, stepsWeightLink, weightInsight } from '@/analytics/insights';
import { movingAverage } from '@/analytics/stats';
import { Card, CardTitle } from '@/components/card';
import { WeightTrendChart } from '@/components/charts/weight-trend-chart';
import { NeedsWeight } from '@/components/needs-weight';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { formatValue } from '@/utils/format';

/**
 * 体重分析画面(このアプリの中核機能)。
 * 体組成スイッチ(体重/体脂肪率/体脂肪量)+期間切替、トレンドチャート、
 * ペース判定、実測ベースの摂取カロリー目安、計測継続率、歩数との相関。
 * 体脂肪量はユーザーのお気に入り指標(体重×体脂肪率から導出)。
 */

const PERIODS = [
  { label: '1ヶ月', value: 30 },
  { label: '3ヶ月', value: 90 },
  { label: '1年', value: 365 },
] as const;

type Composition = 'weight' | 'bodyFat' | 'fatMass';

const COMPOSITIONS: { label: string; value: Composition }[] = [
  { label: '体重', value: 'weight' },
  { label: '体脂肪率', value: 'bodyFat' },
  { label: '体脂肪量', value: 'fatMass' },
];

const COMP_META: Record<Composition, { title: string; unit: string; digits: number }> = {
  weight: { title: '体重の推移', unit: 'kg', digits: 1 },
  bodyFat: { title: '体脂肪率の推移', unit: '%', digits: 1 },
  fatMass: { title: '体脂肪量の推移', unit: 'kg', digits: 1 },
};

function describeCorrelation(r: number): string {
  const strength = Math.abs(r) >= 0.5 ? 'はっきりした' : Math.abs(r) >= 0.25 ? 'ゆるやかな' : '弱い';
  const direction = r < 0 ? 'よく歩いた日ほど体重が減りやすい' : 'よく歩いた日ほど体重が増えやすい';
  return `${strength}傾向: ${direction}`;
}

export default function WeightScreen() {
  const theme = useTheme();
  const [days, setDays] = useState<number>(90);
  const [comp, setComp] = useState<Composition>('weight');

  const weight = useHealthDaily('weight', days);
  const bodyFat = useHealthDaily('bodyFat', days);
  const steps = useHealthDaily('steps', days);
  const basal = useHealthDaily('basalEnergy', 7);
  const active = useHealthDaily('activeEnergy', 7);

  const series =
    comp === 'weight'
      ? (weight.data ?? [])
      : comp === 'bodyFat'
        ? (bodyFat.data ?? [])
        : deriveFatMass(weight.data ?? [], bodyFat.data ?? []);

  const meta = COMP_META[comp];
  const smoothed = movingAverage(series, 7);
  const insight = weightInsight(series);
  const pace =
    comp !== 'bodyFat' && insight.slopePerWeek != null ? assessPace(insight.slopePerWeek) : null;
  const link =
    comp === 'weight' && weight.data && steps.data && days >= 90
      ? stepsWeightLink(weight.data, steps.data)
      : null;
  const adherencePct = Math.round(insight.adherence28 * 100);
  const guide = intakeGuide(basal.data ?? [], active.data ?? []);

  // 体重がなければこの画面は成立しない。空のチャートを見せるより、何をすれば
  // 使えるようになるかを伝える(体重が主役。docs/BRAND.md)
  if (!weight.loading && (weight.data?.length ?? 0) === 0) {
    return (
      <Screen>
        <NeedsWeight />
      </Screen>
    );
  }

  return (
    <Screen>
      <Segmented options={COMPOSITIONS} value={comp} onChange={setComp} />
      <Segmented options={[...PERIODS]} value={days} onChange={setDays} />

      <Card>
        <CardTitle hint={meta.unit}>{meta.title}</CardTitle>
        <WeightTrendChart
          raw={series}
          smoothed={smoothed}
          unit={meta.unit}
          digits={meta.digits}
        />
        {comp === 'fatMass' && (
          <ThemedText type="small" themeColor="textMuted">
            体脂肪量 = 体重 × 体脂肪率(両方を計測した日のみ)
          </ThemedText>
        )}
      </Card>

      <View style={styles.row}>
        <StatTile
          label={`トレンド${COMPOSITIONS.find((c) => c.value === comp)!.label}`}
          value={formatValue(insight.trendWeight, meta.digits)}
          unit={meta.unit}
          delta={
            insight.latest && insight.trendWeight != null
              ? {
                  value: Math.round((insight.latest.value - insight.trendWeight) * 10) / 10,
                  suffix: meta.unit,
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
          unit={`${meta.unit}/週`}
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
                ? `${comp === 'fatMass' ? '体脂肪量' : '体重'}は安定しています。この調子で計測を続けましょう。`
                : '健康的な範囲のペースです(目安: 週±0.5kg以内)。'}
          </ThemedText>
        </Card>
      )}

      <Card>
        <CardTitle hint={guide ? `基礎代謝データ ${guide.basalDays}日分` : undefined}>
          1日の摂取カロリー目安
        </CardTitle>
        {guide ? (
          <>
            <View style={styles.kcalRow}>
              <View style={styles.kcalItem}>
                <ThemedText type="small" themeColor="textMuted">
                  維持
                </ThemedText>
                <ThemedText type="smallBold" style={styles.kcalValue}>
                  {guide.maintain.toLocaleString('ja-JP')}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  kcal
                </ThemedText>
              </View>
              <View style={styles.kcalItem}>
                <ThemedText type="small" themeColor="textMuted">
                  -0.25kg/週
                </ThemedText>
                <ThemedText type="smallBold" style={styles.kcalValue}>
                  {guide.loseQuarterKgPerWeek.toLocaleString('ja-JP')}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  kcal
                </ThemedText>
              </View>
              <View style={styles.kcalItem}>
                <ThemedText type="small" themeColor="textMuted">
                  -0.5kg/週
                </ThemedText>
                <ThemedText type="smallBold" style={styles.kcalValue}>
                  {guide.loseHalfKgPerWeek.toLocaleString('ja-JP')}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  kcal
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              あなたの実測データから: 基礎代謝 {guide.basalAvg.toLocaleString('ja-JP')} kcal +
              アクティブ {guide.activeAvg.toLocaleString('ja-JP')} kcal(7日平均)= 消費{' '}
              {guide.tdee.toLocaleString('ja-JP')} kcal/日
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              体脂肪1kg ≈ 7,700kcal で換算した目安です。極端な制限は避けましょう。
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            基礎代謝(安静時消費エネルギー)のデータがまだ足りません。スマートウォッチや
            活動量計を着けていれば自動で記録されます。
          </ThemedText>
        )}
      </Card>

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
            {link.lagDays === 1
              ? '(翌朝の体重に反映される傾向)'
              : `(${link.lagDays}日後に反映される傾向)`}
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
  kcalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  kcalItem: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  kcalValue: {
    fontSize: 20,
    lineHeight: 26,
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
