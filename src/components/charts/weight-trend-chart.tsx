import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';
import { addDays, dayIndex, formatMonthDay } from '@/utils/date';

interface Props {
  raw: DailyPoint[];
  smoothed: DailyPoint[];
  height?: number;
  /** ツールチップに表示する単位(既定: kg) */
  unit?: string;
  digits?: number;
}

const CHART_HEIGHT = 220;
const Y_LABEL_WIDTH = 36;
// X軸ラベル('M/D' 最大5文字)が収まる幅。ライブラリ既定のラベル幅は
// 点間隔(数px)しかなく「7...」と省略されてしまうため、明示的に広げる
const X_LABEL_WIDTH = 34;

/**
 * 体重の推移チャート: 実測値は控えめなドット、7日移動平均を2pxの主役ラインで
 * 描き、タッチ/ホバーで十字カーソル+ツールチップを出す。
 */
export function WeightTrendChart({
  raw,
  smoothed,
  height = CHART_HEIGHT,
  unit = 'kg',
  digits = 1,
}: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  // 空状態にも本体と同じ onLayout を付ける。React が両分岐の View を同一ノードとして
  // 再利用するため、マウント時に onLayout が無いと react-native-web が ResizeObserver を
  // 登録せず、後からチャート分岐に切り替わっても width が 0 のまま何も描画されない
  // (Webで「読み込み中→チャート」と遷移する画面は必ずこの経路を通る)
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) =>
    setWidth(e.nativeEvent.layout.width);

  if (raw.length < 2) {
    return (
      <View onLayout={onLayout} style={[styles.empty, { height }]}>
        <ThemedText type="small" themeColor="textMuted">
          データがまだありません
        </ThemedText>
      </View>
    );
  }

  const values = raw.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yOffset = Math.floor(min - 0.6);
  const maxValue = Math.ceil(max + 0.6) - yOffset;

  // 時間軸は暦日のリアルな軸: 未計測日もX方向の1日として確保する。
  // 未計測日は value: undefined にすると gifted-charts が線形補間して線をつなぎ、
  // データ点は自動で隠れる(interpolateMissingValues の既定動作)。
  // gap フラグはツールチップで「計測なし」を出すための自前マーカー
  const first = raw[0].date;
  const dayCount = dayIndex(raw[raw.length - 1].date) - dayIndex(first) + 1;
  const byDate = new Map(raw.map((p) => [p.date, p.value]));
  const smoothedByDate = new Map(smoothed.map((p) => [p.date, p.value]));
  // ラベルは先頭からではなく半周期ずらして打つ。index 0 に置くと、広げた
  // ラベル幅の左半分がプロット領域の外にはみ出して「/20」のように切れる
  const labelEvery = Math.max(1, Math.ceil(dayCount / 4));
  const labelOffset = Math.floor(labelEvery / 2);
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - Spacing.two);
  const spacing = plotWidth / dayCount;

  // ラベルはライブラリ既定のTextではなく labelComponent で描く。既定は
  // numberOfLines=1 のため、Webでは max-width がコンテナ幅(=点間隔の数px)に
  // クランプされて「7...」と省略される。幅を明示した自前Textなら制約を受けない。
  // 負のマージンは、広げた幅の中心を点間隔の中心に合わせるため
  const xLabel = (text: string) => {
    function XAxisLabel() {
      return (
        <Text
          style={{
            width: X_LABEL_WIDTH,
            marginLeft: -(X_LABEL_WIDTH - spacing) / 2,
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 10,
          }}>
          {text}
        </Text>
      );
    }
    return XAxisLabel;
  };

  const data = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(first, i);
    const value = byDate.get(date);
    return {
      value,
      labelComponent: i % labelEvery === labelOffset ? xLabel(formatMonthDay(date)) : undefined,
      date,
      gap: value === undefined,
    };
  });
  const data2 = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(first, i);
    const value = smoothedByDate.get(date);
    return { value, date, gap: value === undefined };
  });

  return (
    <View onLayout={onLayout} style={styles.container}>
      {width > 0 && (
        <LineChart
          data={data}
          data2={data2}
          height={height}
          width={plotWidth}
          // 実測系列: ドットのみ(線は描かない)
          color="transparent"
          thickness={0}
          hideDataPoints={false}
          dataPointsColor={theme.seriesWeightSoft}
          dataPointsRadius={2.5}
          // 移動平均系列: 2pxの主役ライン
          color2={theme.seriesWeight}
          thickness2={2}
          hideDataPoints2
          curved
          yAxisOffset={yOffset}
          maxValue={maxValue}
          noOfSections={4}
          initialSpacing={spacing / 2}
          endSpacing={spacing / 2}
          spacing={spacing}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yAxisTextStyle={{ color: theme.textMuted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: 10 }}
          rulesColor={theme.grid}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={theme.axis}
          pointerConfig={{
            pointerStripColor: theme.axis,
            pointerStripWidth: 1,
            pointerColor: theme.seriesWeight,
            radius: 4,
            autoAdjustPointerLabelPosition: true,
            pointerLabelWidth: 130,
            // 指を離してもツールチップを消さない(別の場所をタップすれば移動する)
            persistPointer: true,
            pointerLabelComponent: (items: { value?: number; date?: string; gap?: boolean }[]) => (
              <View
                style={[
                  styles.tooltip,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {items[0]?.date ? formatMonthDay(items[0].date) : ''}
                </ThemedText>
                {items[0]?.gap ? (
                  // 未計測日: 補間された見かけの値を出さない
                  <ThemedText type="smallBold" themeColor="textMuted">
                    計測なし
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="smallBold">
                      実測 {items[0]?.value?.toFixed(digits)} {unit}
                    </ThemedText>
                    {items[1]?.value != null && !items[1].gap ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        平均 {items[1].value.toFixed(digits)} {unit}
                      </ThemedText>
                    ) : null}
                  </>
                )}
              </View>
            ),
          }}
        />
      )}
      {/* 凡例: 2系列。色だけに頼らず形(ドット/ライン)でも区別する */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.seriesWeightSoft }]} />
          <ThemedText type="small" themeColor="textSecondary">
            実測値
          </ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: theme.seriesWeight }]} />
          <ThemedText type="small" themeColor="textSecondary">
            7日移動平均
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
});
