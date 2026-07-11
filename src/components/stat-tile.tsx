import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Sparkline } from '@/components/charts/sparkline';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';

export interface StatTileProps {
  label: string;
  /** フォーマット済み文字列(例 '72.4')。null ならプレースホルダ表示 */
  value: string | null;
  unit?: string;
  /** 比較対象期間に対する符号付き変化量 */
  delta?: { value: number; suffix?: string; vs: string; upIsGood: boolean } | null;
  trend?: DailyPoint[];
  /** スパークラインの終端ドットに使う系列色 */
  accent?: string;
}

export function StatTile({ label, value, unit, delta, trend, accent }: StatTileProps) {
  const theme = useTheme();
  const deltaColor =
    delta == null
      ? theme.textSecondary
      : (delta.value >= 0) === delta.upIsGood
        ? theme.deltaGood
        : theme.deltaBad;

  return (
    <Card style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.valueRow}>
        <ThemedText style={styles.value}>{value ?? '—'}</ThemedText>
        {unit && value != null ? (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.footRow}>
        {delta ? (
          // デルタ文言を優先し、余った幅にスパークラインが収まる(足りなければ非表示)
          <ThemedText type="small" style={{ color: deltaColor, flexShrink: 0 }}>
            {delta.value >= 0 ? '+' : ''}
            {delta.value}
            {delta.suffix ?? ''} {delta.vs}
          </ThemedText>
        ) : null}
        {trend && trend.length >= 2 ? <Sparkline points={trend} accent={accent} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 150,
    gap: Spacing.one,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 600,
  },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: Spacing.two,
    minHeight: 28,
  },
});
