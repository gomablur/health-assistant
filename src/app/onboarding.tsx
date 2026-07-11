import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ALL_METRICS, getHealthSource, isMockSource } from '@/health';
import { useSettings } from '@/store/settings';

/**
 * 初回オンボーディング画面。機能紹介ののち、ヘルスデータの読み取り権限を
 * 要求してからホームへ。拒否されても「許可せずに続ける」導線を残す
 * (権限はあとから設定画面で再リクエスト可能)。
 */

const FEATURES = [
  ['📈', '体重のトレンド分析', '毎朝の計測を移動平均でならし、本当の増減ペースを見える化します。'],
  ['⌚️', 'Apple Watch のデータ活用', '歩数・睡眠・心拍をまとめて振り返り、体重との関係を探ります。'],
  ['🤖', 'AIコーチ', '週次の振り返りと質問への回答で、健康的な生活に伴走します(任意設定)。'],
] as const;

export default function OnboardingScreen() {
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = async () => {
    setRequesting(true);
    setErrorMessage(null);
    try {
      const granted = await getHealthSource().requestPermissions(ALL_METRICS);
      if (!granted) {
        setDenied(true);
        return;
      }
      finish();
    } catch (e) {
      setDenied(true);
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRequesting(false);
    }
  };

  const finish = () => {
    setOnboarded(true);
    router.replace('/');
  };

  const permissionTarget =
    Platform.OS === 'android' ? 'ヘルスコネクト' : 'ヘルスケア';

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <ThemedText type="title" style={styles.center}>
            health{'\n'}assistant
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            計測するだけで終わらせない、健康データの伴走者
          </ThemedText>
        </View>

        <View style={styles.features}>
          {FEATURES.map(([icon, title, desc]) => (
            <View key={title} style={styles.feature}>
              <ThemedText style={styles.icon}>{icon}</ThemedText>
              <View style={styles.featureText}>
                <ThemedText type="smallBold">{title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {desc}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          {denied && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {errorMessage ?? '権限が許可されませんでした。あとから設定画面で再リクエストできます。'}
            </ThemedText>
          )}
          <Button
            title={
              isMockSource()
                ? 'はじめる(モックデータ)'
                : `${permissionTarget}へのアクセスを許可してはじめる`
            }
            onPress={start}
            loading={requesting}
          />
          {denied && <Button title="許可せずに続ける" variant="secondary" onPress={finish} />}
          <ThemedText type="small" themeColor="textMuted" style={styles.center}>
            データの読み取りのみ行い、分析は端末内で完結します。
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  features: {
    gap: Spacing.three,
  },
  feature: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 22,
    lineHeight: 28,
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
});
