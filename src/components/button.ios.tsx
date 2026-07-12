import { Button as SwiftUIButton, Host } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}

/**
 * ネイティブSwiftUIボタン — iOS 26ではLiquid Glass(旧iOSではシステム標準
 * スタイルにフォールバック)。Android / Web は button.tsx の自前実装を使う。
 *
 * tint はSwiftUIのアクセント色。glassProminent では塗りの色、glass では
 * ラベルの色になる。指定しないとシステム標準の青になるため、ブランド色を渡す。
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: Props) {
  const theme = useTheme();
  return (
    // 横幅は親いっぱいに取り(SwiftUI側で中央配置される)、高さだけ中身に合わせる。
    // matchContents を横にも効かせるとHostがボタン幅まで縮み、左寄せに見えてしまう
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <SwiftUIButton
        label={loading ? '処理中…' : title}
        onPress={onPress}
        modifiers={[
          buttonStyle(variant === 'primary' ? 'glassProminent' : 'glass'),
          controlSize('large'),
          // primaryは塗りなので塗り用の濃いコーラル、secondaryはラベル色なのでアクセント色
          tint(variant === 'primary' ? theme.tintFill : theme.tint),
          disabledModifier(!!(disabled || loading)),
        ]}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
