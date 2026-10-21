/**
 * The one storage interface (docs/MOBILE_ARCHITECTURE.md#storage). Three
 * implementations, chosen by what the data is, never by convenience:
 *
 * | Storage             | Backed by                         | For                                          |
 * | ------------------- | --------------------------------- | -------------------------------------------- |
 * | `secureStorage`     | Keychain / Keystore (SecureStore) | credentials: the refresh token, nothing else |
 * | `persistentStorage` | SQLite key-value store            | preferences, flags, non-sensitive state      |
 * | `memoryStorage`     | process memory                    | what must not survive a restart              |
 *
 * Server data is not stored by hand: TanStack Query caches it.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** A synchronous variant, for the few values the first frame needs. */
export interface SyncKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
