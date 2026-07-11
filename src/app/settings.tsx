import { useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, CardTitle } from '@/components/card';
import { ExternalLink } from '@/components/external-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ALL_METRICS, getHealthSource } from '@/health';
import { invalidateHealthCache } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

/**
 * 設定画面(モーダル)。データソース表示・権限再リクエスト・Gemini APIキー管理。
 * この画面は意図的に自前UI(OSネイティブ統一はしない方針の例外側)。
 * 既知の問題: iOSの権限再リクエストは HealthKit の仕様でダイアログが再表示
 * されない(TODO.md参照)。
 */

const SOURCE_LABEL: Record<string, string> = {
  mock: 'モックデータ(開発用)',
  healthkit: 'Apple ヘルスケア (HealthKit)',
  healthconnect: 'ヘルスコネクト (Health Connect)',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const { geminiApiKey, setGeminiApiKey } = useSettings();
  const [keyInput, setKeyInput] = useState('');
  const [requesting, setRequesting] = useState(false);
  const source = getHealthSource();

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    setGeminiApiKey(k);
    setKeyInput('');
  };

  const removeKey = () => {
    if (Platform.OS === 'web') {
      setGeminiApiKey(null);
      return;
    }
    Alert.alert('APIキーを削除', 'AIコーチ機能が使えなくなります。よろしいですか?', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => setGeminiApiKey(null) },
    ]);
  };

  const reRequestPermissions = async () => {
    setRequesting(true);
    try {
      const granted = await source.requestPermissions(ALL_METRICS);
      invalidateHealthCache();
      if (!granted && Platform.OS !== 'web') {
        Alert.alert(
          '権限が許可されていません',
          Platform.OS === 'ios'
            ? '設定アプリ > ヘルスケア > データアクセスとデバイス から許可できます。'
            : 'ヘルスコネクトアプリからアクセス許可を確認してください。',
        );
      }
    } catch (e) {
      Alert.alert('権限をリクエストできません', e instanceof Error ? e.message : String(e));
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Screen>
      <Card>
        <CardTitle>データソース</CardTitle>
        <ThemedText>{SOURCE_LABEL[source.kind] ?? source.kind}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          健康データはOS標準のヘルスアプリから読み取り、分析はすべて端末内で行います。
        </ThemedText>
        {source.kind !== 'mock' && (
          <Button
            title="ヘルスデータの権限を再リクエスト"
            variant="secondary"
            onPress={reRequestPermissions}
            loading={requesting}
          />
        )}
      </Card>

      <Card>
        <CardTitle hint={geminiApiKey ? '登録済み' : '未登録'}>Gemini APIキー</CardTitle>
        <ThemedText type="small" themeColor="textSecondary">
          AIコーチ機能に使用します。Google AI Studio で無料で発行できます(クレジットカード不要)。キーは端末の
          {Platform.OS === 'web' ? 'ローカルストレージ' : 'セキュアストレージ'}にのみ保存されます。
        </ThemedText>
        <ExternalLink href="https://aistudio.google.com/apikey">
          <ThemedText type="linkPrimary">Google AI Studio でキーを発行 ↗</ThemedText>
        </ExternalLink>
        <TextInput
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder={geminiApiKey ? '新しいキーで上書き' : 'AIza... を貼り付け'}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={styles.buttonRow}>
          <View style={styles.buttonFlex}>
            <Button title="保存" onPress={saveKey} disabled={!keyInput.trim()} />
          </View>
          {geminiApiKey && (
            <View style={styles.buttonFlex}>
              <Button title="削除" variant="secondary" onPress={removeKey} />
            </View>
          )}
        </View>
      </Card>

      <Card>
        <CardTitle>このアプリについて</CardTitle>
        <ThemedText type="small" themeColor="textSecondary">
          health-assistant は、毎日のヘルスデータを分析して健康的な生活に伴走する個人用アプリです。
          表示される内容は一般的な情報であり、医療アドバイスではありません。
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    fontSize: 15,
    minHeight: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  buttonFlex: {
    flex: 1,
  },
});
