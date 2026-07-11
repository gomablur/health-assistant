import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { buildCoachSummary, type MetricSeries } from '@/analytics/summary';
import { Button } from '@/components/button';
import { Card, CardTitle } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHealthDaily } from '@/health/useHealthDaily';
import { useTheme } from '@/hooks/use-theme';
import { generateText } from '@/llm/gemini';
import { COACH_SYSTEM_PROMPT, questionContext, weeklyReviewPrompt } from '@/llm/prompts';
import { useSettings } from '@/store/settings';
import { isoWeekKey, todayISO } from '@/utils/date';

/**
 * AIコーチ画面(任意機能 — ローカル分析が主役で、これは追加のお楽しみ)。
 * 週次振り返り(ISO週単位でキャッシュ)と自由質問。LLMに渡すのは
 * CoachSummary(統計値)のみで、日々の生データは端末から出ない。
 * 質問は無料枠保護のため1日の回数上限あり。
 */

const DAILY_QUESTION_LIMIT = 10;
const K_QA_HISTORY = 'coach.qaHistory';

interface QA {
  q: string;
  a: string;
  date: string;
}

export default function CoachScreen() {
  const theme = useTheme();
  const apiKey = useSettings((s) => s.geminiApiKey);

  const weight = useHealthDaily('weight', 90);
  const steps = useHealthDaily('steps', 90);
  const sleep = useHealthDaily('sleep', 90);
  const heart = useHealthDaily('restingHeartRate', 90);
  const energy = useHealthDaily('activeEnergy', 90);

  const seriesReady = weight.data && steps.data && sleep.data && heart.data && energy.data;
  const summary = useMemo(() => {
    if (!seriesReady) return null;
    const series: MetricSeries = {
      weight: weight.data!,
      steps: steps.data!,
      sleep: sleep.data!,
      restingHeartRate: heart.data!,
      activeEnergy: energy.data!,
    };
    return buildCoachSummary(series);
  }, [seriesReady, weight.data, steps.data, sleep.data, heart.data, energy.data]);

  // --- 週次振り返り(ISO週単位でキャッシュ) ---
  const weekKey = isoWeekKey(todayISO());
  const reviewStorageKey = `coach.review.${weekKey}`;
  const [review, setReview] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(reviewStorageKey).then((v) => setReview(v)).catch(() => {});
  }, [reviewStorageKey]);

  const generateReview = useCallback(async () => {
    if (!apiKey || !summary) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const text = await generateText({
        apiKey,
        system: COACH_SYSTEM_PROMPT,
        turns: [{ role: 'user', text: weeklyReviewPrompt(summary) }],
      });
      setReview(text);
      await AsyncStorage.setItem(reviewStorageKey, text);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewLoading(false);
    }
  }, [apiKey, summary, reviewStorageKey]);

  // --- 質問応答 ---
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QA[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(K_QA_HISTORY)
      .then((v) => v && setHistory(JSON.parse(v)))
      .catch(() => {});
  }, []);

  const todayCount = history.filter((h) => h.date === todayISO()).length;
  const limitReached = todayCount >= DAILY_QUESTION_LIMIT;

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!apiKey || !summary || !q || limitReached) return;
    setAsking(true);
    setAskError(null);
    try {
      const a = await generateText({
        apiKey,
        system: COACH_SYSTEM_PROMPT,
        turns: [{ role: 'user', text: `${questionContext(summary)}\n\n質問: ${q}` }],
      });
      setQuestion('');
      setHistory((prev) => {
        const next = [{ q, a, date: todayISO() }, ...prev].slice(0, 20);
        AsyncStorage.setItem(K_QA_HISTORY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }, [apiKey, summary, question, limitReached]);

  if (!apiKey) {
    return (
      <Screen>
        <Card>
          <CardTitle>AIコーチをはじめる</CardTitle>
          <ThemedText type="small" themeColor="textSecondary">
            週次の振り返りや質問への回答に Google Gemini API(無料枠)を使います。設定画面で
            APIキーを登録すると利用できます。データは統計値のみ送信され、日々の生データは端末から出ません。
          </ThemedText>
          <Button title="設定画面でAPIキーを登録" onPress={() => router.push('/settings')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <CardTitle hint={weekKey}>今週の振り返り</CardTitle>
        {review ? (
          <>
            <ThemedText>{review}</ThemedText>
            <Button
              title="もう一度生成する"
              variant="secondary"
              onPress={generateReview}
              loading={reviewLoading}
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              直近のデータの統計サマリーから、今週の振り返りを生成します(週1回の生成結果は保存されます)。
            </ThemedText>
            <Button
              title="振り返りを生成"
              onPress={generateReview}
              loading={reviewLoading}
              disabled={!summary}
            />
          </>
        )}
        {reviewError && (
          <ThemedText type="small" style={{ color: theme.deltaBad }}>
            {reviewError}
          </ThemedText>
        )}
      </Card>

      <Card>
        <CardTitle hint={`今日 ${todayCount}/${DAILY_QUESTION_LIMIT} 回`}>コーチに質問</CardTitle>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="例: 最近眠りが浅いけど、体重と関係ある?"
          placeholderTextColor={theme.textMuted}
          multiline
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        />
        <Button
          title="質問する"
          onPress={ask}
          loading={asking}
          disabled={!question.trim() || limitReached || !summary}
        />
        {limitReached && (
          <ThemedText type="small" themeColor="textSecondary">
            無料枠保護のため、質問は1日{DAILY_QUESTION_LIMIT}回までにしています。また明日どうぞ。
          </ThemedText>
        )}
        {askError && (
          <ThemedText type="small" style={{ color: theme.deltaBad }}>
            {askError}
          </ThemedText>
        )}
      </Card>

      {history.map((h, i) => (
        <Card key={`${h.date}-${i}`}>
          <ThemedText type="smallBold">Q. {h.q}</ThemedText>
          <ThemedText type="small">{h.a}</ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {h.date}
          </ThemedText>
        </Card>
      ))}

      <ThemedText type="small" themeColor="textMuted" style={styles.disclaimer}>
        AIコーチの回答は一般的な情報であり、医療アドバイスではありません。体調に不安がある場合は医師に相談してください。
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 72,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
});
