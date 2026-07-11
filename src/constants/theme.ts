/**
 * デザイントークン(色・フォント・余白)。色は dataviz スキルの検証済み
 * リファレンスパレットに基づく(ライト/ダーク両対応でコントラスト検証済み)。
 *
 * 使い分け:
 * - background / surface / backgroundElement — ページ > カード > 内部要素の3層
 * - series* — メトリクスごとに固定のカテゴリカル色(体重=青、歩数=緑、…)。
 *   同じメトリクスは画面をまたいでも必ず同じ色にする
 * - deltaGood / deltaBad — 変化の良し悪しの色。方向(上下)ではなく意味で使う
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0b0b0b',
    background: '#f9f9f7',
    backgroundElement: '#f0efec',
    backgroundSelected: '#e1e0d9',
    textSecondary: '#52514e',
    // チャートの土台色(リファレンスパレット、ライトのサーフェス #fcfcfb)
    surface: '#fcfcfb',
    textMuted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    tint: '#2a78d6',
    deltaGood: '#006300',
    deltaBad: '#d03b3b',
    // メトリクス系列色(カテゴリカルスロット、メトリクスごとに固定)
    seriesWeight: '#2a78d6',
    seriesWeightSoft: '#9ec5f4',
    seriesSteps: '#1baf7a',
    seriesSleep: '#4a3aa7',
    seriesHeart: '#e34948',
    seriesEnergy: '#eb6834',
  },
  dark: {
    text: '#ffffff',
    background: '#0d0d0d',
    backgroundElement: '#212120',
    backgroundSelected: '#383835',
    textSecondary: '#c3c2b7',
    // チャートの土台色(リファレンスパレット、ダークのサーフェス #1a1a19)
    surface: '#1a1a19',
    textMuted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    tint: '#3987e5',
    deltaGood: '#0ca30c',
    deltaBad: '#d03b3b',
    seriesWeight: '#3987e5',
    seriesWeightSoft: '#1c5cab',
    seriesSteps: '#199e70',
    seriesSleep: '#9085e9',
    seriesHeart: '#e66767',
    seriesEnergy: '#d95926',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOSの標準システムフォント */
    sans: 'system-ui',
    /** iOSのセリフ体システムフォント */
    serif: 'ui-serif',
    /** iOSの丸ゴシック系システムフォント */
    rounded: 'ui-rounded',
    /** iOSの等幅システムフォント */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
