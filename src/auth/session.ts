import { create } from 'zustand';

import { type AuthHandlers, publicApi, setAuthHandlers } from '@/api/client';
import { unwrapWith } from '@/api/unwrap';
import { toAppError } from '@/lib/errors';
import { logger } from '@/lib/observability';
import {
  type KeyValueStorage,
  persistentStorage,
  secureStorage,
  STORAGE_KEYS,
} from '@/lib/storage';

import { type Credentials, SessionSchema, type Tokens, TokensSchema, type User } from './schemas';

// The session (docs/MOBILE_ARCHITECTURE.md#authentication):
//   - the access token lives in memory only, and is renewed shortly before
//     it expires or after a 401;
//   - the refresh token lives in secure storage (Keychain / Keystore) and is
//     rotated by every renewal: the old one stops working;
//   - one renewal at a time: concurrent requests share it, and a request
//     that got a 401 after someone else renewed reuses the new token;
//   - a renewal that lands after a sign-out (or a new sign-in) is discarded
//     and its tokens revoked: nothing resurrects an ended session;
//   - a 401 for a token this session did not issue answers a request of an
//     ended session: it is not replayed with the current token, and neither
//     renews nor ends the current session;
//   - offline at launch, a stored session stays signed in: the first request
//     renews it once the network is back. Only the server ending the session
//     (401 on renewal) signs the user out.
// The navigation follows the state (src/app/_layout.tsx); screens never
// decide on their own who is signed in.

export type SessionStatus = 'restoring' | 'signedIn' | 'signedOut';

interface SessionState {
  status: SessionStatus;
  /** Why the last session ended: the sign-in screen tells an expiry apart. */
  endedBy: 'user' | 'expired' | null;
}

export const useSessionStore = create<SessionState>()(() => ({
  status: 'restoring',
  endedBy: null,
}));

/** Renew the access token this long before it expires: it must not die in flight. */
const EXPIRY_MARGIN_MS = 30_000;

export interface SessionDependencies {
  /** Secure storage: the refresh token. */
  storage: KeyValueStorage;
  /** Persistent storage, wiped by an uninstall: the installation marker. */
  installation: KeyValueStorage;
  api: Pick<typeof publicApi, 'POST'>;
  now: () => number;
}

export interface Session extends AuthHandlers {
  /** At launch: picks up a stored session, if any. Always settles the status; never rejects. */
  restore(): Promise<void>;
  signIn(credentials: Credentials): Promise<User>;
  /** Ends the session on this device at once, and on the server when reachable. */
  signOut(): Promise<void>;
  onSignIn(listener: (user: User) => void): () => void;
  onSignOut(listener: () => void): () => void;
}

export function createSession({ storage, installation, api, now }: SessionDependencies): Session {
  let access: { token: string; expiresAt: number } | null = null;
  // Every access token the current session handed out (one per renewal),
  // forgotten with it: requests that carry any other token were sent by a
  // session that no longer exists.
  let issued = new Set<string>();
  let renewing: Promise<string | null> | null = null;
  // Bumped by every sign-in and sign-out: a renewal started before belongs
  // to a session that no longer exists.
  let generation = 0;
  const signInListeners = new Set<(user: User) => void>();
  const signOutListeners = new Set<() => void>();
  const setState = useSessionStore.setState;

  async function keep(tokens: Tokens): Promise<void> {
    access = {
      token: tokens.accessToken,
      expiresAt: now() + tokens.expiresIn * 1000 - EXPIRY_MARGIN_MS,
    };
    issued.add(tokens.accessToken);
    await storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
  }

  async function storedRefreshToken(): Promise<string | null> {
    try {
      return await storage.getItem(STORAGE_KEYS.refreshToken);
    } catch (error) {
      // An unreadable keychain entry (restored device, OS bug): start over.
      logger.warn('auth', 'Stored session unreadable', { kind: toAppError(error).kind });
      return null;
    }
  }

  async function end(endedBy: 'user' | 'expired'): Promise<void> {
    generation += 1;
    access = null;
    issued = new Set();
    renewing = null;
    try {
      await storage.removeItem(STORAGE_KEYS.refreshToken);
    } catch {
      logger.warn('auth', 'Stored session could not be removed');
    }
    setState({ status: 'signedOut', endedBy });
    for (const listener of signOutListeners) listener();
  }

  function revoke(refreshToken: string): void {
    api.POST('/api/auth/logout', { body: { refreshToken } }).catch(() => {
      // The device already forgot the session; the server expires it later.
      logger.info('auth', 'Server-side logout not confirmed');
    });
  }

  async function renew(startedIn: number): Promise<string | null> {
    const refreshToken = await storedRefreshToken();
    if (refreshToken === null) {
      if (startedIn === generation) await end('expired');
      return null;
    }
    let tokens: Tokens;
    try {
      tokens = await unwrapWith(
        api.POST('/api/auth/refresh', { body: { refreshToken } }),
        TokensSchema,
      );
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind !== 'unauthenticated') throw appError; // transient: keep the session
      if (startedIn === generation) {
        logger.info('auth', 'Session expired');
        await end('expired');
      }
      return null;
    }
    if (startedIn !== generation) {
      revoke(tokens.refreshToken);
      return null;
    }
    await keep(tokens);
    return tokens.accessToken;
  }

  function renewOnce(): Promise<string | null> {
    renewing ??= renew(generation).finally(() => {
      renewing = null;
    });
    return renewing;
  }

  // The iOS Keychain survives an uninstall: a token found on the first launch
  // of an installation belongs to a previous one and is not trusted. The
  // marker is written only once that token is gone, so a failed deletion is
  // retried at the next launch. Storage failures (a full disk, a corrupted
  // database) cost a sign-in, never the launch: an installation that cannot
  // be confirmed is treated as a new one.
  async function isKnownInstallation(): Promise<boolean> {
    try {
      if ((await installation.getItem(STORAGE_KEYS.installation)) !== null) return true;
      await storage.removeItem(STORAGE_KEYS.refreshToken);
      await installation.setItem(STORAGE_KEYS.installation, new Date().toISOString());
    } catch (error) {
      logger.warn('auth', 'Installation not confirmed', { kind: toAppError(error).kind });
    }
    return false;
  }

  return {
    async restore() {
      if (!(await isKnownInstallation()) || (await storedRefreshToken()) === null) {
        setState({ status: 'signedOut', endedBy: null });
        return;
      }
      try {
        if ((await renewOnce()) !== null) setState({ status: 'signedIn', endedBy: null });
      } catch {
        // Offline or server down: the session is probably still valid.
        logger.info('auth', 'Session restored without renewal (offline)');
        setState({ status: 'signedIn', endedBy: null });
      }
    },

    async signIn(credentials) {
      const session = await unwrapWith(
        api.POST('/api/auth/sign-in', { body: credentials }),
        SessionSchema,
      );
      generation += 1;
      issued = new Set();
      renewing = null;
      await keep(session);
      setState({ status: 'signedIn', endedBy: null });
      for (const listener of signInListeners) listener(session.user);
      return session.user;
    },

    async signOut() {
      const refreshToken = await storedRefreshToken();
      await end('user');
      if (refreshToken !== null) revoke(refreshToken);
    },

    async getAccessToken() {
      if (access !== null && access.expiresAt > now()) return access.token;
      if (useSessionStore.getState().status !== 'signedIn') return null;
      return renewOnce();
    },

    async refreshAfterRejection(rejected) {
      // A request of an ended session: replaying it would send it as whoever
      // is signed in now, and renewing would end (or expire) their session.
      if (!issued.has(rejected)) return null;
      // Someone renewed while this request was in flight: use that token.
      if (access !== null && access.token !== rejected && access.expiresAt > now()) {
        return access.token;
      }
      if (access?.token === rejected) access = null;
      return renewOnce();
    },

    onSignIn(listener) {
      signInListeners.add(listener);
      return () => {
        signInListeners.delete(listener);
      };
    },

    onSignOut(listener) {
      signOutListeners.add(listener);
      return () => {
        signOutListeners.delete(listener);
      };
    },
  };
}

export const session = createSession({
  storage: secureStorage,
  installation: persistentStorage,
  api: publicApi,
  now: Date.now,
});
setAuthHandlers(session);

export function useSessionStatus(): SessionStatus {
  return useSessionStore((state) => state.status);
}
