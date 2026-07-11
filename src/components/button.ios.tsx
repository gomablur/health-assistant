import { Button as SwiftUIButton, Host } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, disabled as disabledModifier } from '@expo/ui/swift-ui/modifiers';

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
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: Props) {
  return (
    <Host matchContents style={{ alignItems: 'center' }}>
      <SwiftUIButton
        label={loading ? '処理中…' : title}
        onPress={onPress}
        modifiers={[
          buttonStyle(variant === 'primary' ? 'glassProminent' : 'glass'),
          controlSize('large'),
          disabledModifier(!!(disabled || loading)),
        ]}
      />
    </Host>
  );
}
