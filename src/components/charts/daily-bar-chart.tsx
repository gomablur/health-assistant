import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatMonthDay, todayISO } from '@/utils/date';

interface Props {
  points: DailyPoint[];
  /** trailing days to show (missing days render as gaps with 0 height) */
  days: number;
  color: string;
  unit: string;
  digits?: number;
  height?: number;
}

const Y_LABEL_WIDTH = 40;

/** Daily magnitude bars: 4px rounded data-end, per-bar tap/hover tooltip. */
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

  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - Spacing.two);
  // 2px surface gap minimum between adjacent bars; bars capped at 24px
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
          xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: 10 }}
          rulesColor={theme.grid}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={theme.axis}
          disableScroll
          focusBarOnPress
          focusedBarConfig={{ color: theme.text }}
          renderTooltip={(item: { value: number; date?: string }) => (
            <View
              style={[
                styles.tooltip,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <ThemedText type="small" themeColor="textSecondary">
                {item.date ? formatMonthDay(item.date) : ''}
              </ThemedText>
              <ThemedText type="smallBold">
                {fmt(item.value)} {unit}
              </ThemedText>
            </View>
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
