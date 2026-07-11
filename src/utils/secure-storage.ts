import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * シークレット保管: 実機では expo-secure-store 経由で Keychain / Keystore に保存。
 * SecureStoreにはWeb実装がないため、Web(モック開発環境)はAsyncStorageに
 * フォールバックする — Webビルドはモックデータしか扱わないので許容。
 */

async function secureStore() {
  return await import('expo-secure-store');
}

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  return (await secureStore()).getItemAsync(key);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
  return (await secureStore()).setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
  return (await secureStore()).deleteItemAsync(key);
}
