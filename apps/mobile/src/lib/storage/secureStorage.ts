import * as SecureStore from 'expo-secure-store';

import type { KeyValueStorage } from './types';

// Credentials only (SECURITY.md#storage): the Keychain on iOS, values
// encrypted with a Keystore key on Android. Readable after the first unlock
// following a restart (so a background refresh works), and never migrated to
// another device or included in a backup (THIS_DEVICE_ONLY). Values are
// small: a token, not a document.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore accepts alphanumerics, ".", "-" and "_" in keys.
const KEY = /^[\w.-]{1,128}$/;

function checked(key: string): string {
  if (!KEY.test(key)) throw new Error(`Invalid secure storage key "${key}"`);
  return key;
}

export const secureStorage: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(checked(key), OPTIONS),
  setItem: (key, value) => SecureStore.setItemAsync(checked(key), value, OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(checked(key), OPTIONS),
};
