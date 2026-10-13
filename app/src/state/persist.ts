import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Store } from './createStore';

export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

/** Writes the picked fields whenever the store changes (debounced). */
export function persistStore<T extends object>(store: Store<T>, key: string, pick: (s: T) => unknown): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = JSON.stringify(pick(store.get()));
  store.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const next = JSON.stringify(pick(store.get()));
      if (next !== last) {
        last = next;
        AsyncStorage.setItem(key, next).catch(() => undefined);
      }
    }, 150);
  });
}

// Server keys live in the Android keystore; the web build (tests only) falls back to storage.
const secureKey = (id: string) => `savesama.token.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export async function getToken(id: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(secureKey(id));
  try {
    return await SecureStore.getItemAsync(secureKey(id));
  } catch {
    return null;
  }
}

export async function setToken(id: string, token: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(secureKey(id), token);
  await SecureStore.setItemAsync(secureKey(id), token);
}

export async function deleteToken(id: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(secureKey(id));
  await SecureStore.deleteItemAsync(secureKey(id)).catch(() => undefined);
}
