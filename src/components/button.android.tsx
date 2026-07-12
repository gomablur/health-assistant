import { Button as ComposeButton, Host, OutlinedButton, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
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
 * ネイティブJetpack ComposeボタンMaterial 3。iOSは button.ios.tsx のSwiftUI版、
 * Webは button.tsx の自前実装を使う。
 *
 * 色を指定しないとM3は壁紙由来のダイナミックカラーになるため、ブランド色を明示する
 * (タブバーの選択色と揃える)。primary=塗り、secondary=アウトライン。
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading }: Props) {
  const theme = useTheme();
  const enabled = !(disabled || loading);
  const label = loading ? '処理中…' : title;
  const Component = variant === 'primary' ? ComposeButton : OutlinedButton;
  const colors =
    variant === 'primary'
      ? { containerColor: theme.tint, contentColor: '#ffffff' }
      : { containerColor: 'transparent', contentColor: theme.tint };

  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <Component
        onClick={onPress}
        enabled={enabled}
        colors={colors}
        modifiers={[fillMaxWidth()]}>
        <Text>{label}</Text>
      </Component>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
