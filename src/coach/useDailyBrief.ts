import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { useHealthDaily } from '@/health/useHealthDaily';
import { addDays, todayISO } from '@/utils/date';
import { buildDailyBrief, type BriefKind, type DailyBrief } from './briefing';

const K_HEADLINES = 'brief.headlineKinds'; // { [dateISO]: BriefKind }

/**
 * Today's brief from local statistics. Remembers which kind headlined
 * yesterday (AsyncStorage) so two mornings in a row never open with the
 * same message type.
 */
export function useDailyBrief(): { brief: DailyBrief | null; loading: boolean } {
  const weight = useHealthDaily('weight', 90);
  const steps = useHealthDaily('steps', 90);
  const sleep = useHealthDaily('sleep', 30);
  const heart = useHealthDaily('restingHeartRate', 35);

  const [recentKinds, setRecentKinds] = useState<BriefKind[] | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(K_HEADLINES)
      .then((raw) => {
        const map: Record<string, BriefKind> = raw ? JSON.parse(raw) : {};
        const yesterday = map[addDays(todayISO(), -1)];
        setRecentKinds(yesterday ? [yesterday] : []);
      })
      .catch(() => setRecentKinds([]));
  }, []);

  const ready =
    weight.data != null &&
    steps.data != null &&
    sleep.data != null &&
    heart.data != null &&
    recentKinds != null;

  const brief = useMemo(() => {
    if (!ready) return null;
    return buildDailyBrief(
      {
        weight: weight.data!,
        steps: steps.data!,
        sleep: sleep.data!,
        restingHeartRate: heart.data!,
      },
      { recentHeadlineKinds: recentKinds! },
    );
  }, [ready, weight.data, steps.data, sleep.data, heart.data, recentKinds]);

  // remember today's headline kind for tomorrow's dedup (keep 3 days)
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
