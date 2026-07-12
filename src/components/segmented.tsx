import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Option<T> {
  label: string;
  value: T;
}

interface Props<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * チャート上部のフィルタ行に使うセグメントコントロール(全プラットフォーム共通の自前実装)。
 *
 * かつてOSネイティブ(UISegmentedControl / M3 SegmentedButton)を使っていたが、
 * ネイティブ版はテーマAPIが歯抜けで、Androidでは選択中の塗りしか色を指定できず、
 * ラベル色が壁紙由来のダイナミックカラー(緑)のまま残ってしまう。チャートの
 * フィルタはネイティブである価値がほぼないため、自前実装に一本化した。
 */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              selected && {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}>
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: Spacing.three - 3,
  },
});
