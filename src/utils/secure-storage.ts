import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Secret storage: Keychain / Keystore via expo-secure-store on device.
 * SecureStore has no web implementation, so web (mock development) falls back
 * to AsyncStorage — acceptable because web builds only ever see mock data.
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
