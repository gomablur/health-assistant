import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { deleteSecret, getSecret, setSecret } from '@/utils/secure-storage';

const K_ONBOARDED = 'settings.onboarded';
const K_GEMINI_KEY = 'secret.geminiApiKey';

interface SettingsState {
  hydrated: boolean;
  onboarded: boolean;
  geminiApiKey: string | null;
  setOnboarded: (v: boolean) => void;
  setGeminiApiKey: (key: string | null) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  hydrated: false,
  onboarded: false,
  geminiApiKey: null,
  setOnboarded: (v) => {
    set({ onboarded: v });
    AsyncStorage.setItem(K_ONBOARDED, v ? '1' : '0').catch(() => {});
  },
  setGeminiApiKey: (key) => {
    set({ geminiApiKey: key });
    (key ? setSecret(K_GEMINI_KEY, key) : deleteSecret(K_GEMINI_KEY)).catch(() => {});
  },
}));

let hydrating: Promise<void> | null = null;

/** Load persisted settings once at app start (idempotent). */
export function hydrateSettings(): Promise<void> {
  hydrating ??= (async () => {
    const [onboarded, key] = await Promise.all([
      AsyncStorage.getItem(K_ONBOARDED).catch(() => null),
      getSecret(K_GEMINI_KEY).catch(() => null),
    ]);
    useSettings.setState({
      hydrated: true,
      onboarded: onboarded === '1',
      geminiApiKey: key,
    });
  })();
  return hydrating;
}
