export { readJson, writeJson } from './json';
export { createMemoryStorage, memoryStorage } from './memoryStorage';
export { persistentStorage, persistentStorageSync } from './persistentStorage';
export { secureStorage } from './secureStorage';
export type { KeyValueStorage, SyncKeyValueStorage } from './types';

/**
 * Every key the app stores, in one place: what is kept where is reviewable at
 * a glance, and two features cannot collide.
 */
export const STORAGE_KEYS = {
  /** secureStorage: the refresh token of the session. */
  refreshToken: 'auth.refreshToken',
  /** persistentStorage: user preferences (src/store/preferences.ts). */
  preferences: 'app.preferences',
  /**
   * persistentStorage: set on the first launch. The iOS Keychain survives an
   * uninstall, this store does not: without the marker, the stored session
   * belongs to a previous installation and is wiped (src/auth/session.ts).
   */
  installation: 'app.installation',
} as const;
