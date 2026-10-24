import { publicApi } from '@/api/client';
import { createHttp } from '@/api/http';
import { createMemoryStorage, STORAGE_KEYS } from '@/lib/storage';
import {
  bodyOf,
  deferred,
  failure,
  noContent,
  ok,
  stubFetch,
  type StubbedFetch,
} from '@/test/http';
import { item, session as sessionFixture, user } from '@/test/fixtures';

import { createSession, type Session, useSessionStore } from './session';

// The session against the real API client and HTTP layer, with the network
// stubbed: what is stored, what is sent, and in which order.

let clock = 0;
let secure: ReturnType<typeof createMemoryStorage>;
let installation: ReturnType<typeof createMemoryStorage>;
let fetchStub: StubbedFetch;

function create() {
  return createSession({ storage: secure, installation, api: publicApi, now: () => clock });
}

beforeEach(async () => {
  clock = 0;
  secure = createMemoryStorage();
  installation = createMemoryStorage();
  await installation.setItem(STORAGE_KEYS.installation, 'installed');
  useSessionStore.setState({ status: 'restoring', endedBy: null, user: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  fetchStub.restore();
});

describe('restore', () => {
  it('is signed out without a stored session, without asking the server', async () => {
    fetchStub = stubFetch({});
    await create().restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('renews a stored session and keeps the rotated refresh token', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({ 'POST /api/auth/refresh': () => ok(sessionFixture('1')) });
    const session = create();
    await session.restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await bodyOf(fetchStub.requests[0]!)).toEqual({ refreshToken: 'refresh-0' });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
    await expect(session.getAccessToken()).resolves.toBe('access-1');
    expect(fetchStub.requests).toHaveLength(1);
  });

  it('signs out when the server ended the session', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({
      'POST /api/auth/refresh': () => failure(401, 'Invalid refresh token'),
    });
    await create().restore();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'expired',
      user: null,
    });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it('stays signed in when offline, and renews once the network is back', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({
      'POST /api/auth/refresh': () => Promise.reject(new TypeError('Network request failed')),
    });
    const session = create();
    await session.restore();
    // Who it belongs to is unknown until the first renewal.
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user: null });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-0');

    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('1')));
    await expect(session.getAccessToken()).resolves.toBe('access-1');
    expect(useSessionStore.getState().user).toEqual(user);
  });

  it('forgets a session left by a previous installation (iOS Keychain survives uninstalls)', async () => {
    installation = createMemoryStorage();
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-from-old-install');
    fetchStub = stubFetch({});
    await create().restore();
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    expect(await installation.getItem(STORAGE_KEYS.installation)).not.toBeNull();
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('starts over when the stored session cannot be read', async () => {
    fetchStub = stubFetch({});
    jest.spyOn(secure, 'getItem').mockRejectedValue(new Error('Keystore unavailable'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await create().restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('refuses a renewal that breaks the contract, keeping the session', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({ 'POST /api/auth/refresh': () => ok({ accessToken: 'a' }) });
    await create().restore();
    expect(useSessionStore.getState().status).toBe('signedIn');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-0');
  });

  // The splash screen stays until the status leaves 'restoring': a storage
  // failure must cost a sign-in, never the launch.
  it('does not use the stored session while the installation marker cannot be read', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    jest
      .spyOn(installation, 'getItem')
      .mockRejectedValueOnce(new Error('database disk image is malformed'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchStub = stubFetch({ 'POST /api/auth/refresh': () => ok(sessionFixture('1')) });
    await create().restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(fetchStub.requests).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('[auth] Installation not confirmed', expect.anything());

    // The next launch, with the marker readable again, restores it.
    await create().restore();
    expect(useSessionStore.getState().status).toBe('signedIn');
  });

  it('settles on signed out when the installation marker cannot be written', async () => {
    installation = createMemoryStorage();
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-from-old-install');
    jest.spyOn(installation, 'setItem').mockRejectedValue(new Error('database or disk is full'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchStub = stubFetch({});
    await expect(create().restore()).resolves.toBeUndefined();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('keeps the marker unwritten while a leftover session cannot be deleted', async () => {
    installation = createMemoryStorage();
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-from-old-install');
    jest.spyOn(secure, 'removeItem').mockRejectedValue(new Error('Keychain locked'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchStub = stubFetch({});
    await create().restore();
    // Not trusted now, and checked again at the next launch.
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(await installation.getItem(STORAGE_KEYS.installation)).toBeNull();
    expect(fetchStub.requests).toHaveLength(0);
  });
});

describe('signIn and signOut', () => {
  it('signs in, stores the refresh token only, and tells the listeners', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    const onSignIn = jest.fn();
    session.onSignIn(onSignIn);
    await expect(session.signIn({ email: user.email, password: 'pw' })).resolves.toEqual(user);
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
    expect(onSignIn).toHaveBeenCalledWith(user);
    await expect(session.getAccessToken()).resolves.toBe('access-1');
  });

  it('leaves the state untouched when the credentials are wrong', async () => {
    useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => failure(401, 'Invalid credentials') });
    await expect(create().signIn({ email: user.email, password: 'bad' })).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it('signs out locally at once, even when the server cannot be told', async () => {
    fetchStub = stubFetch({
      'POST /api/auth/sign-in': () => ok(sessionFixture('1')),
      'POST /api/auth/logout': () => Promise.reject(new TypeError('Network request failed')),
    });
    const session = create();
    const onSignOut = jest.fn();
    const unsubscribe = session.onSignOut(onSignOut);
    await session.signIn({ email: user.email, password: 'pw' });
    await session.signOut();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'user',
      user: null,
    });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    await expect(session.getAccessToken()).resolves.toBeNull();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await new Promise(process.nextTick);
    const logout = fetchStub.requests.find((request) => request.url.endsWith('/logout'));
    expect(await bodyOf(logout!)).toEqual({ refreshToken: 'refresh-1' });
    unsubscribe();
  });
});

// A confirmed sign-up, an accepted invitation or a changed password answer a
// new session: the app adopts it as if the user had just signed in.
describe('adopt', () => {
  it('starts the session it is handed, stores the refresh token and tells the listeners', async () => {
    fetchStub = stubFetch({});
    useSessionStore.setState({ status: 'signedOut', endedBy: 'expired', user: null });
    const session = create();
    const onSignIn = jest.fn();
    session.onSignIn(onSignIn);
    await expect(session.adopt(sessionFixture('1'))).resolves.toEqual(user);
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
    expect(onSignIn).toHaveBeenCalledWith(user);
    await expect(session.getAccessToken()).resolves.toBe('access-1');
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('replaces the current session: its renewal in flight is discarded and revoked', async () => {
    fetchStub = stubFetch({
      'POST /api/auth/sign-in': () => ok(sessionFixture('1')),
      'POST /api/auth/logout': () => noContent(),
    });
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    const pending = deferred();
    fetchStub.on('POST /api/auth/refresh', () => pending.promise);
    const renewal = session.refreshAfterRejection('access-1');
    await new Promise(process.nextTick);

    await session.adopt(sessionFixture('2'));
    pending.resolve(ok(sessionFixture('late')));

    await expect(renewal).resolves.toBeNull();
    await new Promise(process.nextTick);
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-2');
    await expect(session.getAccessToken()).resolves.toBe('access-2');
    // A request of the replaced session is not replayed with the new token.
    await expect(session.refreshAfterRejection('access-1')).resolves.toBeNull();
    const revoked = await Promise.all(
      fetchStub.requests.filter((request) => request.url.endsWith('/logout')).map(bodyOf),
    );
    expect(revoked).toEqual([{ refreshToken: 'refresh-late' }]);
  });

  it('keeps the data of the same account: a changed password is the same user', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    const onSignOut = jest.fn();
    session.onSignOut(onSignOut);
    await session.signIn({ email: user.email, password: 'pw' });
    await session.adopt(sessionFixture('2'));
    expect(onSignOut).not.toHaveBeenCalled();
    await new Promise(process.nextTick);
    // The server ended the previous session itself (every session ends).
    expect(fetchStub.requests.some((request) => request.url.endsWith('/logout'))).toBe(false);
  });

  it('signs the previous account out when the session belongs to another one', async () => {
    fetchStub = stubFetch({
      'POST /api/auth/sign-in': () => ok(sessionFixture('1')),
      'POST /api/auth/logout': () => noContent(),
    });
    const session = create();
    const events: string[] = [];
    session.onSignOut(() => events.push('signed out'));
    session.onSignIn((signedIn) => events.push(`signed in ${signedIn.id}`));
    await session.signIn({ email: user.email, password: 'pw' });
    const invited = { ...user, id: 'user-invited', email: 'invited@example.com' };

    await session.adopt(sessionFixture('b', invited));

    // The previous account's data goes before the new one arrives.
    expect(events).toEqual(['signed in user-1', 'signed out', 'signed in user-invited']);
    expect(useSessionStore.getState()).toEqual({
      status: 'signedIn',
      endedBy: null,
      user: invited,
    });
    await new Promise(process.nextTick);
    const revoked = await Promise.all(
      fetchStub.requests.filter((request) => request.url.endsWith('/logout')).map(bodyOf),
    );
    expect(revoked).toEqual([{ refreshToken: 'refresh-1' }]);
    await expect(session.getAccessToken()).resolves.toBe('access-b');
  });

  it('refuses a session that breaks the contract, leaving the state untouched', async () => {
    fetchStub = stubFetch({});
    useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
    const session = create();
    await expect(
      session.adopt({ accessToken: 'a' } as unknown as Parameters<Session['adopt']>[0]),
    ).rejects.toThrow();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null, user: null });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
  });
});

describe('listeners and storage failures', () => {
  it('stops telling a sign-in listener that unsubscribed', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    const onSignIn = jest.fn();
    const unsubscribe = session.onSignIn(onSignIn);
    await session.signIn({ email: user.email, password: 'pw' });
    unsubscribe();
    await session.adopt(sessionFixture('2'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('ends the session here even when the stored token cannot be removed', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    jest.spyOn(secure, 'removeItem').mockRejectedValue(new Error('Keychain locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await session.forget();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'user',
      user: null,
    });
    await expect(session.getAccessToken()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[auth] Stored session could not be removed',
      expect.anything(),
    );
  });

  it('ends a session whose stored token is gone by the time it renews', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    await secure.removeItem(STORAGE_KEYS.refreshToken);
    await expect(session.refreshAfterRejection('access-1')).resolves.toBeNull();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'expired',
      user: null,
    });
    expect(fetchStub.requests.some((request) => request.url.endsWith('/refresh'))).toBe(false);
  });
});

describe('forget', () => {
  it('ends the session here like a sign-out, without telling the server', async () => {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    const onSignOut = jest.fn();
    session.onSignOut(onSignOut);
    await session.signIn({ email: user.email, password: 'pw' });
    await session.forget();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'user',
      user: null,
    });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    await expect(session.getAccessToken()).resolves.toBeNull();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await new Promise(process.nextTick);
    expect(fetchStub.requests.some((request) => request.url.endsWith('/logout'))).toBe(false);
  });
});

// After a link ended every session of an account, which may be this one.
describe('revalidate', () => {
  async function signedIn() {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    return session;
  }

  function refreshes() {
    return fetchStub.requests.filter((request) => request.url.endsWith('/refresh'));
  }

  it('asks the server nothing while signed out', async () => {
    fetchStub = stubFetch({});
    const session = create();
    useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
    await session.revalidate();
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('ends a session the server ended at once, as an expired one', async () => {
    const session = await signedIn();
    const onSignOut = jest.fn();
    session.onSignOut(onSignOut);
    fetchStub.on('POST /api/auth/refresh', () => failure(401, 'Invalid refresh token'));
    // The access token is still fresh: no request would have found out yet.
    await session.revalidate();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'expired',
      user: null,
    });
    expect(await bodyOf(refreshes()[0]!)).toEqual({ refreshToken: 'refresh-1' });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps a session the server still holds (another account’s), renewed', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('2')));
    await session.revalidate();
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-2');
    await expect(session.getAccessToken()).resolves.toBe('access-2');
  });

  it('keeps the session when the server cannot answer, and never rejects', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await expect(session.revalidate()).resolves.toBeUndefined();
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('shares a renewal already in flight', async () => {
    const session = await signedIn();
    const pending = deferred();
    fetchStub.on('POST /api/auth/refresh', () => pending.promise);
    const rejected = session.refreshAfterRejection('access-1');
    const revalidated = session.revalidate();
    pending.resolve(failure(401, 'Invalid refresh token'));
    await expect(rejected).resolves.toBeNull();
    await revalidated;
    expect(refreshes()).toHaveLength(1);
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});

describe('renewal', () => {
  async function signedIn() {
    fetchStub = stubFetch({ 'POST /api/auth/sign-in': () => ok(sessionFixture('1')) });
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    return session;
  }

  it('renews before the access token expires', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('2')));
    clock = 900_000; // the token lives 900 s, renewed 30 s early
    await expect(session.getAccessToken()).resolves.toBe('access-2');
  });

  it('shares one renewal between concurrent rejected requests', async () => {
    const session = await signedIn();
    const pending = deferred();
    fetchStub.on('POST /api/auth/refresh', () => pending.promise);
    const results = Promise.all([
      session.refreshAfterRejection('access-1'),
      session.refreshAfterRejection('access-1'),
      session.refreshAfterRejection('access-1'),
    ]);
    pending.resolve(ok(sessionFixture('2')));
    await expect(results).resolves.toEqual(['access-2', 'access-2', 'access-2']);
    expect(fetchStub.requests.filter((request) => request.url.endsWith('/refresh'))).toHaveLength(
      1,
    );
  });

  it('reuses a token renewed while a request was in flight', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('2')));
    await session.refreshAfterRejection('access-1');
    await expect(session.refreshAfterRejection('access-1')).resolves.toBe('access-2');
    expect(fetchStub.requests.filter((request) => request.url.endsWith('/refresh'))).toHaveLength(
      1,
    );
  });

  it('discards and revokes a renewal that lands after a sign-out', async () => {
    const session = await signedIn();
    const pending = deferred();
    fetchStub.on('POST /api/auth/refresh', () => pending.promise);
    fetchStub.on('POST /api/auth/logout', () => noContent());
    const renewal = session.refreshAfterRejection('access-1');
    await new Promise(process.nextTick);
    await session.signOut();
    pending.resolve(ok(sessionFixture('late')));
    await expect(renewal).resolves.toBeNull();
    await new Promise(process.nextTick);
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    const revoked = await Promise.all(
      fetchStub.requests.filter((request) => request.url.endsWith('/logout')).map(bodyOf),
    );
    expect(revoked).toContainEqual({ refreshToken: 'refresh-late' });
  });

  it('keeps one renewal at a time in the next session while a late one of the previous lands', async () => {
    const session = await signedIn();
    // The server rotates refresh tokens: a second renewal with the same one
    // reuses a rotated token, and is refused.
    const lateRenewal = deferred();
    const nextRenewal = deferred();
    const answers = [lateRenewal.promise, nextRenewal.promise];
    fetchStub.on(
      'POST /api/auth/refresh',
      () => answers.shift() ?? failure(401, 'Reused refresh token'),
    );
    fetchStub.on('POST /api/auth/logout', () => noContent());
    const late = session.refreshAfterRejection('access-1');
    await new Promise(process.nextTick);
    await session.signOut();
    fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('2')));
    await session.signIn({ email: user.email, password: 'pw' });
    const renewal = session.refreshAfterRejection('access-2');
    await new Promise(process.nextTick);

    lateRenewal.resolve(ok(sessionFixture('late')));
    await expect(late).resolves.toBeNull();
    // Another request of the new session needs a token while its renewal runs.
    const token = session.getAccessToken();
    nextRenewal.resolve(ok(sessionFixture('3')));

    await expect(Promise.all([renewal, token])).resolves.toEqual(['access-3', 'access-3']);
    expect(fetchStub.requests.filter((request) => request.url.endsWith('/refresh'))).toHaveLength(
      2,
    );
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
  });

  it('shows a role changed on the server at the next renewal', async () => {
    const session = await signedIn();
    const admin = { ...user, role: 'admin' as const };
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('2', admin)));
    await expect(session.refreshAfterRejection('access-1')).resolves.toBe('access-2');
    expect(useSessionStore.getState().user).toEqual(admin);
  });

  it('ends the session when the server refuses the renewal', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => failure(401, 'Reused refresh token'));
    await expect(session.refreshAfterRejection('access-1')).resolves.toBeNull();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'expired',
      user: null,
    });
  });

  it('keeps the session when renewing fails for a transient reason', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => failure(503, 'Maintenance'));
    await expect(session.refreshAfterRejection('access-1')).rejects.toMatchObject({
      kind: 'server',
    });
    expect(useSessionStore.getState().status).toBe('signedIn');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });
});

// A request still in flight when its session ends (sign-out, expiry) can be
// answered 401 at any later moment, even after someone else signed in.
describe('a request of an ended session', () => {
  const API = 'https://api.example.com';

  async function inFlight(session: Session, path: '/api/items' | '/api/users/me') {
    const held = deferred();
    const authorizations: (string | null)[] = [];
    let sent!: () => void;
    const firstSent = new Promise<void>((resolve) => {
      sent = resolve;
    });
    fetchStub.on(`${path === '/api/items' ? 'POST' : 'GET'} ${path}`, (request) => {
      authorizations.push(request.headers.get('Authorization'));
      sent();
      return authorizations.length === 1 ? held.promise : ok(item(9), 201);
    });
    const response = createHttp({ auth: session })(
      new Request(`${API}${path}`, path === '/api/items' ? { method: 'POST', body: '{}' } : {}),
    );
    await firstSent;
    return { held, authorizations, response };
  }

  beforeEach(() => {
    fetchStub = stubFetch({
      'POST /api/auth/sign-in': () => ok(sessionFixture('1')),
      'POST /api/auth/logout': () => noContent(),
    });
  });

  it('is never replayed with the token of the user who signed in next', async () => {
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    const request = await inFlight(session, '/api/items');

    await session.signOut();
    fetchStub.on('POST /api/auth/sign-in', () =>
      ok({ ...sessionFixture('b'), user: { ...user, id: 'user-b', email: 'b@example.com' } }),
    );
    await session.signIn({ email: 'b@example.com', password: 'pw' });
    request.held.resolve(failure(401, 'Session revoked'));

    expect((await request.response).status).toBe(401);
    expect(request.authorizations).toEqual(['Bearer access-1']);
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signedIn',
      endedBy: null,
      user: { id: 'user-b' },
    });
    await expect(session.getAccessToken()).resolves.toBe('access-b');
    expect(fetchStub.requests.some((sent) => sent.url.endsWith('/refresh'))).toBe(false);
  });

  it('does not turn a sign-out by the user into an expired session', async () => {
    const session = create();
    const onSignOut = jest.fn();
    session.onSignOut(onSignOut);
    await session.signIn({ email: user.email, password: 'pw' });
    const request = await inFlight(session, '/api/users/me');

    await session.signOut();
    request.held.resolve(failure(401, 'Session revoked'));

    expect((await request.response).status).toBe(401);
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'user',
      user: null,
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(fetchStub.requests.some((sent) => sent.url.endsWith('/refresh'))).toBe(false);
  });

  it('still reuses a token renewed by its own session', async () => {
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('2')));
    const request = await inFlight(session, '/api/items');
    clock = 900_000; // the session renews while the request is in flight
    await expect(session.getAccessToken()).resolves.toBe('access-2');
    request.held.resolve(failure(401, 'Expired token'));

    expect((await request.response).status).toBe(201);
    expect(request.authorizations).toEqual(['Bearer access-1', 'Bearer access-2']);
  });
});
