import { StyleSheet, View } from 'react-native';

import { Card, CardTitle } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * 体重データがないときの案内。
 *
 * このアプリは「毎朝の体重の変動が何を意味するのか」を読み解く解釈アプリなので、
 * 体重が主役(docs/BRAND.md)。歩数や睡眠だけでも画面は成立するが、核が動かない。
 * そこを黙って空欄にしておくと「壊れているアプリ」に見えるため、何をすれば
 * 本領を発揮するのかを伝える。
 *
 * 責めない・急かさない。持っていない人を責めるのではなく、価値を説明する。
 */
export function NeedsWeight() {
  return (
    <Card>
      <CardTitle>体重の記録がありません</CardTitle>
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          このアプリの中心は「今朝の体重が何を意味するのか」を読み解くことです。
          体重計に乗った記録がOSのヘルスアプリに入ると、
          日々の増減がノイズなのか本当の変化なのかを毎朝お伝えできるようになります。
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          体重をヘルスアプリに記録できる体重計(スマート体重計など)があれば、
          あとは毎朝乗るだけです。こちらでの入力は必要ありません。
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          それまでは、歩数や睡眠の記録から分かることをお伝えします。
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.two,
  },
});
