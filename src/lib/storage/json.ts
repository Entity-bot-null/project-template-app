import type { z } from 'zod';

import type { KeyValueStorage } from './types';

// Stored data is external input: an older app version wrote it, or someone
// tampered with the device. It is parsed with a schema on the way in; what
// does not match is dropped, never trusted.

export async function readJson<T extends z.ZodType>(
  storage: KeyValueStorage,
  key: string,
  schema: T,
): Promise<z.infer<T> | null> {
  const raw = await storage.getItem(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await storage.removeItem(key);
    return null;
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    await storage.removeItem(key);
    return null;
  }
  return result.data;
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): Promise<void> {
  return storage.setItem(key, JSON.stringify(value));
}
