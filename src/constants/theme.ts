/**
 * デザイントークン(色・フォント・余白)。ブランド(朝焼けコーラル、docs/BRAND.md)に
 * 合わせつつ、dataviz スキルのバリデータでライト/ダーク両モードとも検証済み
 * (明度バンド・CVD分離・サーフェスコントラスト)。
 *
 * 使い分け:
 * - background / surface / backgroundElement — ページ > カード > 内部要素の3層
 * - series* — メトリクスごとに固定のカテゴリカル色(体重=ブランドコーラル、歩数=緑、…)。
 *   同じメトリクスは画面をまたいでも必ず同じ色にする
 * - tint — 操作系のアクセント。ダークは体重色と同一、ライトのみ白文字4.5:1を
 *   確保するため一段濃いコーラルにしている
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
    tint: '#c14e28',
    /** Androidの波紋(Material Rippleは半透明で下地に重ねる) */
    tintRipple: 'rgba(193,78,40,0.20)',
    deltaGood: '#006300',
    deltaBad: '#d03b3b',
    // メトリクス系列色(カテゴリカルスロット、メトリクスごとに固定)
    seriesWeight: '#e56638',
    seriesWeightSoft: '#f2ac90',
    seriesSteps: '#1baf7a',
    seriesSleep: '#4a3aa7',
    seriesHeart: '#d55181',
    seriesEnergy: '#eda100',
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
    tint: '#e56638',
    tintRipple: 'rgba(229,102,56,0.24)',
    deltaGood: '#0ca30c',
    deltaBad: '#d03b3b',
    seriesWeight: '#e56638',
    seriesWeightSoft: '#a04425',
    seriesSteps: '#199e70',
    seriesSleep: '#9085e9',
    seriesHeart: '#d55181',
    seriesEnergy: '#c98500',
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
