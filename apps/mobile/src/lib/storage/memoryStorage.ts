import type { KeyValueStorage } from './types';

/** Process memory: gone on restart. Also the stand-in for the others in tests. */
export function createMemoryStorage(): KeyValueStorage & { clear(): void } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      values.clear();
    },
  };
}

export const memoryStorage = createMemoryStorage();
