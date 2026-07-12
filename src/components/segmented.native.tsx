import { SegmentedControl } from '@expo/ui/community/segmented-control';

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
 * OSネイティブのセグメントコントロール(UISegmentedControl / Material 3)。
 * iOS 26ではLiquid Glassになるため自前では再現できない。Webは segmented.tsx。
 *
 * tintColor は Android / Web 専用で、選択中セグメントの塗りにだけ効く
 * (iOSの選択中はシステム標準のニュートラルグレーで、青くならないので指定不要)。
 * ラベル色までは渡せないため、Androidの選択中ラベルは壁紙由来のダイナミック
 * カラーのまま残る。全状態の色を制御したくなったら @expo/ui/jetpack-compose の
 * SegmentedButton プリミティブを直に組む必要がある。
 */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const theme = useTheme();
  const index = options.findIndex((o) => o.value === value);
  return (
    <SegmentedControl
      values={options.map((o) => o.label)}
      selectedIndex={index < 0 ? 0 : index}
      tintColor={theme.tintFill}
      onValueChange={(label) => {
        const selected = options.find((o) => o.label === label);
        if (selected) onChange(selected.value);
      }}
    />
  );
}
