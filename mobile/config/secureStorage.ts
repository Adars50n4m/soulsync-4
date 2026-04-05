// mobile/config/secureStorage.ts
// ─────────────────────────────────────────────────────────────────────────────
// SECURE STORAGE ADAPTER FOR SUPABASE AUTH
//
// Uses expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on Android)
// for sensitive auth tokens. Falls back to AsyncStorage for non-sensitive data
// or when SecureStore is unavailable (e.g. Expo Go on older devices).
//
// WHY: AsyncStorage stores data in cleartext — device theft = account compromise.
// SecureStore encrypts at the OS level, same as WhatsApp/Signal.
// ─────────────────────────────────────────────────────────────────────────────

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// SecureStore has a 2048-byte value limit on some platforms.
// Supabase JWT tokens can exceed this, so we chunk if needed.
const CHUNK_SIZE = 2000;

function getChunkKey(key: string, index: number): string {
  return `${key}__chunk_${index}`;
}

async function secureSet(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    // Clean up any old chunks from a previously larger value
    await SecureStore.deleteItemAsync(getChunkKey(key, 0)).catch(() => {});
    return;
  }

  // Store in chunks for large JWTs
  const chunks = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(key, `__chunked__${chunks}`);
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(
      getChunkKey(key, i),
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    );
  }
}

async function secureGet(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;

  if (!value.startsWith('__chunked__')) return value;

  // Reassemble chunks
  const chunks = parseInt(value.replace('__chunked__', ''), 10);
  let result = '';
  for (let i = 0; i < chunks; i++) {
    const chunk = await SecureStore.getItemAsync(getChunkKey(key, i));
    if (!chunk) return null; // Corrupted — treat as missing
    result += chunk;
  }
  return result;
}

async function secureRemove(key: string): Promise<void> {
  const value = await SecureStore.getItemAsync(key);
  if (value?.startsWith('__chunked__')) {
    const chunks = parseInt(value.replace('__chunked__', ''), 10);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.deleteItemAsync(getChunkKey(key, i)).catch(() => {});
    }
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * Supabase-compatible storage adapter using SecureStore.
 *
 * Implements the same getItem/setItem/removeItem interface that
 * Supabase expects from `auth.storage`.
 */
export const SupabaseSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Try SecureStore first
      const secureValue = await secureGet(key);
      if (secureValue) return secureValue;

      // Migration: check AsyncStorage for old sessions stored before SecureStore migration
      const asyncValue = await AsyncStorage.getItem(key);
      if (asyncValue) {
        // Migrate to SecureStore for future reads
        console.log('[SecureStorage] Migrating key from AsyncStorage to SecureStore:', key);
        await secureSet(key, asyncValue).catch(() => {});
        await AsyncStorage.removeItem(key).catch(() => {});
        return asyncValue;
      }

      return null;
    } catch (e) {
      // Fallback: SecureStore unavailable (e.g. Expo Go on some devices)
      console.warn('[SecureStorage] getItem fallback to AsyncStorage for:', key);
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await secureSet(key, value);
      // Clean up old AsyncStorage copy if exists
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch (e) {
      console.warn('[SecureStorage] setItem fallback to AsyncStorage for:', key);
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await secureRemove(key);
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch (e) {
      console.warn('[SecureStorage] removeItem fallback to AsyncStorage for:', key);
      await AsyncStorage.removeItem(key);
    }
  },
};
