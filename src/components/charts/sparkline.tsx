import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import type { DailyPoint } from '@/health/types';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  points: DailyPoint[];
  /** 上限幅。実際の幅は親の空きに合わせて縮む(狭いタイルでのはみ出し防止) */
  maxWidth?: number;
  height?: number;
  /** 終端(現在値)ドットの系列色。線自体は控えめな色のまま */
  accent?: string;
}

/** StatTile用スパークライン: 線は控えめ色、終端ドットだけ系列色で現在値を示す。 */
export function Sparkline({ points, maxWidth = 96, height = 28, accent }: Props) {
  const theme = useTheme();
  // 固定幅にせず、親レイアウトの空きを実測して描画幅を決める。
  // 2タイル並びの狭い画面では maxWidth 未満に縮み、カードからはみ出さない
  const [width, setWidth] = useState(0);

  const draw = width >= 24 && points.length >= 2;
  let svg = null;
  if (draw) {
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
    svg = (
      <Svg width={width} height={height}>
        <Polyline
          points={coords}
          fill="none"
          stroke={theme.axis}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 終端ドット: 線と重なっても読めるようサーフェス色のリングを敷く */}
        <Circle cx={lastX} cy={lastY} r={4.5} fill={theme.surface} />
        <Circle cx={lastX} cy={lastY} r={3} fill={accent ?? theme.tint} />
      </Svg>
    );
  }

  return (
    <View
      style={{ flexGrow: 1, flexShrink: 1, maxWidth, height, alignItems: 'flex-end' }}
      onLayout={(e) => setWidth(Math.min(e.nativeEvent.layout.width, maxWidth))}>
      {svg}
    </View>
  );
}
