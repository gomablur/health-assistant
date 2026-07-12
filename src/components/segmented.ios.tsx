import { SegmentedControl } from '@expo/ui/community/segmented-control';

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
 * OSネイティブのセグメントコントロール(UISegmentedControl)。iOS 26ではLiquid Glassで、
 * 自前では再現できないためネイティブを使う。
 *
 * 色は指定しない。iOSの選択中セグメントはシステム標準でニュートラルグレーであり、
 * 青くならないため上書きの必要がない(tintColor プロパティも android / web 専用)。
 * Android は segmented.android.tsx、Web は segmented.tsx。
 */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <SegmentedControl
      values={options.map((o) => o.label)}
      selectedIndex={index < 0 ? 0 : index}
      onValueChange={(label) => {
        const selected = options.find((o) => o.label === label);
        if (selected) onChange(selected.value);
      }}
    />
  );
}
