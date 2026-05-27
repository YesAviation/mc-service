import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memory = new Map<string, string>();
const useNative = Platform.OS === 'ios' || Platform.OS === 'android';

async function get(key: string): Promise<string | null> {
  if (!useNative) return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

async function set(key: string, value: string): Promise<void> {
  if (!useNative) {
    memory.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memory.set(key, value);
  }
}

async function remove(key: string): Promise<void> {
  if (!useNative) {
    memory.delete(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    memory.delete(key);
  }
}

export const secureStorage = { get, set, remove };
export const kvStorage = { get, set, remove };
