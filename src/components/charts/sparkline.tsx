import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  points: DailyPoint[];
  width?: number;
  height?: number;
  /** series color for the current-value end dot; the line stays de-emphasized */
  accent?: string;
}

/** Stat-tile sparkline: de-emphasis hue line, end dot in the series accent. */
export function Sparkline({ points, width = 96, height = 28, accent }: Props) {
  const theme = useTheme();
  if (points.length < 2) return <View style={{ width, height }} />;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const coords = values.map((v, i) => `${pad + i * step},${y(v)}`).join(' ');
  const lastX = pad + (points.length - 1) * step;
  const lastY = y(values[values.length - 1]);

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={coords}
        fill="none"
        stroke={theme.axis}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* end dot with a surface ring so it reads over the line */}
      <Circle cx={lastX} cy={lastY} r={4.5} fill={theme.surface} />
      <Circle cx={lastX} cy={lastY} r={3} fill={accent ?? theme.tint} />
    </Svg>
  );
}
