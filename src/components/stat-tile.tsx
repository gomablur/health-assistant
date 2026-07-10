import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Sparkline } from '@/components/charts/sparkline';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';

export interface StatTileProps {
  label: string;
  /** already formatted (e.g. '72.4') — null renders a placeholder */
  value: string | null;
  unit?: string;
  /** signed change vs a named period */
  delta?: { value: number; suffix?: string; vs: string; upIsGood: boolean } | null;
  trend?: DailyPoint[];
  /** series color for the sparkline end dot */
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
          <ThemedText type="small" style={{ color: deltaColor }}>
            {delta.value >= 0 ? '+' : ''}
            {delta.value}
            {delta.suffix ?? ''} {delta.vs}
          </ThemedText>
        ) : (
          <View />
        )}
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
    minHeight: 28,
  },
});
