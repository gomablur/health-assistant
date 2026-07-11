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

/** OS-native segmented control (UISegmentedControl / Material 3 segmented buttons). */
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
