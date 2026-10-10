import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import {
  createMemoryStorage,
  persistentStorage,
  persistentStorageSync,
  readJson,
  secureStorage,
  writeJson,
} from './index';

describe('secureStorage', () => {
  it('stores in the Keychain/Keystore, this device only, after first unlock', async () => {
    await secureStorage.setItem('auth.refreshToken', 'value');
    await expect(secureStorage.getItem('auth.refreshToken')).resolves.toBe('value');
    expect(jest.mocked(SecureStore.setItemAsync)).toHaveBeenCalledWith(
      'auth.refreshToken',
      'value',
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
    await secureStorage.removeItem('auth.refreshToken');
    await expect(secureStorage.getItem('auth.refreshToken')).resolves.toBeNull();
  });

  it('refuses keys SecureStore cannot hold', () => {
    expect(() => secureStorage.getItem('not allowed/key')).toThrow(/Invalid secure storage key/);
  });
});

describe('persistentStorage', () => {
  it('reads back what it wrote, asynchronously and synchronously', async () => {
    await persistentStorage.setItem('k', 'v');
    expect(persistentStorageSync.getItem('k')).toBe('v');
    persistentStorageSync.setItem('k', 'w');
    await expect(persistentStorage.getItem('k')).resolves.toBe('w');
    persistentStorageSync.removeItem('k');
    await persistentStorage.removeItem('other');
    await expect(persistentStorage.getItem('k')).resolves.toBeNull();
  });
});

describe('readJson', () => {
  const Schema = z.object({ count: z.number() });

  it('returns valid data and drops what does not match', async () => {
    const storage = createMemoryStorage();
    await writeJson(storage, 'ok', { count: 2 });
    await expect(readJson(storage, 'ok', Schema)).resolves.toEqual({ count: 2 });

    await storage.setItem('tampered', JSON.stringify({ count: 'many' }));
    await expect(readJson(storage, 'tampered', Schema)).resolves.toBeNull();
    await expect(storage.getItem('tampered')).resolves.toBeNull();

    await storage.setItem('corrupt', '{not json');
    await expect(readJson(storage, 'corrupt', Schema)).resolves.toBeNull();
    await expect(readJson(storage, 'missing', Schema)).resolves.toBeNull();
  });

  it('memory storage forgets on clear', async () => {
    const storage = createMemoryStorage();
    await storage.setItem('a', '1');
    storage.clear();
    await expect(storage.getItem('a')).resolves.toBeNull();
  });
});
