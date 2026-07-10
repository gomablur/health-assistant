/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
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
    // dataviz chrome (reference palette, light surface #fcfcfb)
    surface: '#fcfcfb',
    textMuted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    tint: '#2a78d6',
    deltaGood: '#006300',
    deltaBad: '#d03b3b',
    // metric series (categorical slots, fixed per entity)
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
    // dataviz chrome (reference palette, dark surface #1a1a19)
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
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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
