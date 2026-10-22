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

import {
  type Credentials,
  type Session as SessionBody,
  SessionSchema,
  type Tokens,
  type User,
} from './schemas';

// The session (docs/mobile-architecture.md#authentication):
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
//     (401 on renewal) signs the user out;
//   - a session the API hands over outside sign-in (a confirmed sign-up, an
//     accepted invitation, a changed password) is adopted with the same
//     guarantees: whatever the previous one was doing is dropped;
//   - the signed-in user (id, email, name, role) comes with every session
//     and every renewal, and is kept in memory only.
// The navigation follows the state (src/app/_layout.tsx); screens never
// decide on their own who is signed in.

export type SessionStatus = 'restoring' | 'signedIn' | 'signedOut';

interface SessionState {
  status: SessionStatus;
  /** Why the last session ended: the sign-in screen tells an expiry apart. */
  endedBy: 'user' | 'expired' | null;
  /**
   * Who is signed in, from the latest session or renewal; null while a
   * session restored offline has not been renewed yet.
   */
  user: User | null;
}

export const useSessionStore = create<SessionState>()(() => ({
  status: 'restoring',
  endedBy: null,
  user: null,
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
  /**
   * Starts the session the API handed over (a confirmed sign-up, an accepted
   * invitation, a changed password), replacing the current one if any.
   */
  adopt(session: SessionBody): Promise<User>;
  /** Ends the session on this device at once, and on the server when reachable. */
  signOut(): Promise<void>;
  /**
   * Ends the session on this device only, the way signOut() does, for one the
   * server already ended (a deleted account): nothing is left to revoke.
   */
  forget(): Promise<void>;
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

  /**
   * A new session: everything of the previous one is dropped first. When it
   * belongs to another account (an invitation accepted while signed in), the
   * previous account is signed out as a sign-out would: its data is cleared
   * (the sign-out listeners) and its refresh token revoked.
   */
  async function start(body: SessionBody): Promise<User> {
    const previous = useSessionStore.getState();
    // A session restored offline and not renewed yet has no known user: it
    // counts as another account.
    const anotherAccount = previous.status === 'signedIn' && previous.user?.id !== body.user.id;
    const replaced = anotherAccount ? await storedRefreshToken() : null;
    generation += 1;
    access = null;
    issued = new Set();
    renewing = null;
    if (anotherAccount) for (const listener of signOutListeners) listener();
    await keep(body);
    setState({ status: 'signedIn', endedBy: null, user: body.user });
    for (const listener of signInListeners) listener(body.user);
    if (replaced !== null) revoke(replaced);
    return body.user;
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
    setState({ status: 'signedOut', endedBy, user: null });
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
    let renewed: SessionBody;
    try {
      renewed = await unwrapWith(
        api.POST('/api/auth/refresh', { body: { refreshToken } }),
        SessionSchema,
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
      revoke(renewed.refreshToken);
      return null;
    }
    await keep(renewed);
    // A role changed on the server shows at the next renewal.
    setState({ user: renewed.user });
    return renewed.accessToken;
  }

  function renewOnce(): Promise<string | null> {
    if (renewing === null) {
      const current = renew(generation).finally(() => {
        // A sign-out or a sign-in drops this renewal and the next session may
        // start its own: clearing that one would let a second renewal reuse
        // its rotated refresh token, and the server would end the session.
        if (renewing === current) renewing = null;
      });
      renewing = current;
    }
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
        setState({ status: 'signedOut', endedBy: null, user: null });
        return;
      }
      try {
        if ((await renewOnce()) !== null) setState({ status: 'signedIn', endedBy: null });
      } catch {
        // Offline or server down: the session is probably still valid. Who
        // it belongs to is known at the first renewal.
        logger.info('auth', 'Session restored without renewal (offline)');
        setState({ status: 'signedIn', endedBy: null });
      }
    },

    async signIn(credentials) {
      return start(
        await unwrapWith(api.POST('/api/auth/sign-in', { body: credentials }), SessionSchema),
      );
    },

    async adopt(body) {
      return start(SessionSchema.parse(body));
    },

    async signOut() {
      const refreshToken = await storedRefreshToken();
      await end('user');
      if (refreshToken !== null) revoke(refreshToken);
    },

    async forget() {
      await end('user');
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

/** Who is signed in; null while signed out, or restored offline and not renewed yet. */
export function useSessionUser(): User | null {
  return useSessionStore((state) => state.user);
}
