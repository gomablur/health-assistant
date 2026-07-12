import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';

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
 * OSネイティブのセグメントコントロール(Material 3)。iOSは segmented.ios.tsx
 * (UISegmentedControl)、Webは segmented.tsx の自前実装。
 *
 * community版の SegmentedControl ラッパーではなく M3 のプリミティブを直に組むのは、
 * ラッパーの tintColor が activeContainerColor(選択中の塗り)にしか渡らず、
 * ラベル色が壁紙由来のダイナミックカラー(onSecondaryContainer = 緑)のまま残るため。
 * プリミティブなら全状態の色を明示できる。
 */
export function Segmented<T extends string | number>({ options, value, onChange }: Props<T>) {
  const theme = useTheme();
  const colors = {
    activeContainerColor: theme.tintFill,
    activeContentColor: theme.tintOnFill,
    activeBorderColor: theme.tintFill,
    inactiveContainerColor: theme.background,
    inactiveContentColor: theme.textSecondary,
    inactiveBorderColor: theme.axis,
  };

  return (
    <Host matchContents={{ vertical: true }}>
      <SingleChoiceSegmentedButtonRow>
        {options.map((o) => (
          <SegmentedButton
            key={String(o.value)}
            selected={o.value === value}
            onClick={() => onChange(o.value)}
            colors={colors}>
            <SegmentedButton.Label>
              <Text>{o.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}
