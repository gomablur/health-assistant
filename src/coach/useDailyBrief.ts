import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { useHealthDaily } from '@/health/useHealthDaily';
import { addDays, todayISO } from '@/utils/date';
import {
  buildDailyBrief,
  type BriefKind,
  type BriefOptions,
  type DailyBrief,
} from './briefing';

const K_HEADLINES = 'brief.headlineKinds'; // { [dateISO]: BriefKind }

/**
 * ローカル統計から今日のブリーフを組み立てるフック。
 * 直近3日ぶんのヘッドライン種類をAsyncStorageに覚えておき、同じ話題で
 * 続けて始まらないようにする(昨日の種類は除外、一昨日以前は減点。詳細は briefing.ts)。
 *
 * 曜日リズムの所見に84日ぶんの体重が要るので、体重だけ長めに取る。
 */
export function useDailyBrief(): { brief: DailyBrief | null; loading: boolean } {
  const weight = useHealthDaily('weight', 120);
  const steps = useHealthDaily('steps', 90);
  const sleep = useHealthDaily('sleep', 30);
  const heart = useHealthDaily('restingHeartRate', 45);
  const bodyFat = useHealthDaily('bodyFat', 60);

  const [history, setHistory] = useState<BriefOptions | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(K_HEADLINES)
      .then((raw) => {
        const map: Record<string, BriefKind> = raw ? JSON.parse(raw) : {};
        const today = todayISO();
        setHistory({
          yesterdayKind: map[addDays(today, -1)] ?? null,
          staleKinds: [2, 3]
            .map((d) => map[addDays(today, -d)])
            .filter((k): k is BriefKind => k != null),
        });
      })
      .catch(() => setHistory({}));
  }, []);

  const ready =
    weight.data != null &&
    steps.data != null &&
    sleep.data != null &&
    heart.data != null &&
    bodyFat.data != null &&
    history != null;

  const brief = useMemo(() => {
    if (!ready) return null;
    return buildDailyBrief(
      {
        weight: weight.data!,
        steps: steps.data!,
        sleep: sleep.data!,
        restingHeartRate: heart.data!,
        bodyFat: bodyFat.data!,
      },
      history!,
    );
  }, [ready, weight.data, steps.data, sleep.data, heart.data, bodyFat.data, history]);

  // 今日のヘッドライン種類を明日の重複回避用に保存(保持は3日分)
  useEffect(() => {
    if (!brief) return;
    const today = todayISO();
    AsyncStorage.getItem(K_HEADLINES)
      .then((raw) => {
        const map: Record<string, BriefKind> = raw ? JSON.parse(raw) : {};
        map[today] = brief.headline.kind;
        for (const date of Object.keys(map)) {
          if (date < addDays(today, -3)) delete map[date];
        }
        return AsyncStorage.setItem(K_HEADLINES, JSON.stringify(map));
      })
      .catch(() => {});
  }, [brief]);

  return { brief, loading: !ready };
}
