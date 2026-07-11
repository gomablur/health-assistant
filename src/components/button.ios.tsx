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
 * Native SwiftUI button — Liquid Glass on iOS 26 (falls back to the system
 * default style on older iOS). Android and web use the custom implementation
 * in button.tsx.
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
