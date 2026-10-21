import Storage from 'expo-sqlite/kv-store';

import type { KeyValueStorage, SyncKeyValueStorage } from './types';

// Non-sensitive data that survives restarts (preferences, onboarding state):
// a key-value table in the app's SQLite database, private to the app but not
// encrypted. Never a credential or personal data a backup could expose (the
// app also opts out of Android backups, app.config.ts). Structured offline
// data goes in its own SQLite tables (docs/mobile-architecture.md#offline).
export const persistentStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: (key) => Storage.removeItem(key),
};

/**
 * The same store, read synchronously: for the small state the first frame
 * needs (theme, onboarding), so the app never renders with defaults and then
 * flips. Keep it to a few keys: every read blocks the JavaScript thread.
 */
export const persistentStorageSync: SyncKeyValueStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => {
    Storage.setItemSync(key, value);
  },
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};
