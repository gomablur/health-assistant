import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';
import { formatMonthDay } from '@/utils/date';

interface Props {
  raw: DailyPoint[];
  smoothed: DailyPoint[];
  height?: number;
}

const CHART_HEIGHT = 220;
const Y_LABEL_WIDTH = 36;

/**
 * Weight over time: raw measurements as de-emphasized dots, the 7-day moving
 * average as the 2px story line, crosshair tooltip on touch/hover.
 */
export function WeightTrendChart({ raw, smoothed, height = CHART_HEIGHT }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  if (raw.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
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

  const labelEvery = Math.max(1, Math.ceil(raw.length / 4));
  const data = raw.map((p, i) => ({
    value: p.value,
    label: i % labelEvery === 0 ? formatMonthDay(p.date) : '',
    date: p.date,
  }));
  const data2 = smoothed.map((p) => ({ value: p.value, date: p.date }));

  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - Spacing.two);
  const spacing = raw.length > 1 ? plotWidth / raw.length : plotWidth;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.container}>
      {width > 0 && (
        <LineChart
          data={data}
          data2={data2}
          height={height}
          width={plotWidth}
          // raw series: dots only
          color="transparent"
          thickness={0}
          hideDataPoints={false}
          dataPointsColor={theme.seriesWeightSoft}
          dataPointsRadius={2.5}
          // smoothed series: the 2px story line
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
            pointerLabelComponent: (items: { value: number; date?: string }[]) => (
              <View
                style={[
                  styles.tooltip,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {items[0]?.date ? formatMonthDay(items[0].date) : ''}
                </ThemedText>
                <ThemedText type="smallBold">
                  実測 {items[0]?.value?.toFixed(1)} kg
                </ThemedText>
                {items[1] ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    平均 {items[1].value.toFixed(1)} kg
                  </ThemedText>
                ) : null}
              </View>
            ),
          }}
        />
      )}
      {/* legend: two series, identity never by color alone */}
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
