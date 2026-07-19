import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatMonthDay, todayISO } from '@/utils/date';

interface Props {
  points: DailyPoint[];
  /** 表示する直近日数(未計測日は高さ0の隙間として描画) */
  days: number;
  color: string;
  unit: string;
  digits?: number;
  height?: number;
}

const Y_LABEL_WIDTH = 40;
// X軸ラベル('M/D' 最大5文字)が収まる幅。既定は棒幅+隙間しかなく
// 「7/...」と省略されてしまう
const X_LABEL_WIDTH = 30;
// ツールチップ(2行+余白)が棒の上に収まるのに必要な高さの見積もり。
// 棒の上端からチャート上端までがこれより狭ければ、棒の内側に反転表示する
const TOOLTIP_CLEARANCE = 64;

/**
 * ツールチップ本体。チャートは棒の上端のすぐ上に配置するため、棒が高いと
 * チャート上端からはみ出して切れる。flip 時は自身の高さを測って棒の内側
 * (上端のすぐ下)へずらす。高さが測れるまでは非表示にしてガタつきを防ぐ。
 */
function BarTooltip({ flip, children }: { flip: boolean; children: ReactNode }) {
  const theme = useTheme();
  const [h, setH] = useState(0);
  return (
    <View
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={[
        styles.tooltip,
        { backgroundColor: theme.surface, borderColor: theme.border },
        flip && (h > 0 ? { transform: [{ translateY: h + Spacing.two }] } : { opacity: 0 }),
      ]}>
      {children}
    </View>
  );
}

/** 日次量のバーチャート: 角丸4pxのバー、タップ/ホバーでツールチップ。 */
export function DailyBarChart({ points, days, color, unit, digits = 0, height = 160 }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const end = todayISO();
  const start = addDays(end, -(days - 1));
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const labelEvery = Math.max(1, Math.ceil(days / 5));

  const data = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return {
      value: byDate.get(date) ?? 0,
      label: i % labelEvery === 0 ? formatMonthDay(date) : '',
      date,
    };
  });
  // gifted-charts が maxValue 未指定時に使う軸最大値(次の10の倍数への
  // 切り上げ)を再現し、棒のピクセル高さの見積もりに使う
  const dataMax = Math.max(...data.map((d) => d.value));
  const chartMax = dataMax + (10 - (dataMax % 10));

  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - Spacing.two);
  // 隣接バー間は最低2pxの隙間、バー幅は最大24px
  const barWidth = Math.min(24, Math.max(3, Math.floor(plotWidth / days) - 2));
  const spacing = Math.max(2, (plotWidth - barWidth * days) / days);

  const fmt = (v: number) =>
    digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString('ja-JP');

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <BarChart
          data={data}
          height={height}
          width={plotWidth}
          frontColor={color}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={spacing / 2}
          barBorderTopLeftRadius={4}
          barBorderTopRightRadius={4}
          noOfSections={3}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yAxisTextStyle={{ color: theme.textMuted, fontSize: 10 }}
          labelWidth={X_LABEL_WIDTH}
          // labelWidth で広がったコンテナは右に伸びるので、負のマージンで
          // ラベル中心を棒の中心に合わせる
          xAxisLabelTextStyle={{
            color: theme.textMuted,
            fontSize: 10,
            marginLeft: -(X_LABEL_WIDTH - barWidth),
          }}
          rulesColor={theme.grid}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={theme.axis}
          disableScroll
          focusBarOnPress
          focusedBarConfig={{ color: theme.text }}
          // 右端の棒はツールチップが右にはみ出すので左へ寄せる
          leftShiftForLastIndexTooltip={48}
          renderTooltip={(item: { value: number; date?: string }) => (
            <BarTooltip
              flip={(item.value / chartMax) * height > height - TOOLTIP_CLEARANCE}>
              <ThemedText type="small" themeColor="textSecondary">
                {item.date ? formatMonthDay(item.date) : ''}
              </ThemedText>
              <ThemedText type="smallBold">
                {fmt(item.value)} {unit}
              </ThemedText>
            </BarTooltip>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginBottom: Spacing.one,
  },
});
