import { publicApi } from '@/api/client';
import { createHttp } from '@/api/http';
import { createMemoryStorage, STORAGE_KEYS } from '@/lib/storage';
import { bodyOf, deferred, failure, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { item, session as sessionFixture, tokens, user } from '@/test/fixtures';

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
  useSessionStore.setState({ status: 'restoring', endedBy: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  fetchStub.restore();
});

describe('restore', () => {
  it('is signed out without a stored session, without asking the server', async () => {
    fetchStub = stubFetch({});
    await create().restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null });
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('renews a stored session and keeps the rotated refresh token', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({ 'POST /api/auth/refresh': () => ok(tokens('1')) });
    const session = create();
    await session.restore();
    expect(useSessionStore.getState().status).toBe('signedIn');
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: 'expired' });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it('stays signed in when offline, and renews once the network is back', async () => {
    await secure.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
    fetchStub = stubFetch({
      'POST /api/auth/refresh': () => Promise.reject(new TypeError('Network request failed')),
    });
    const session = create();
    await session.restore();
    expect(useSessionStore.getState().status).toBe('signedIn');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-0');

    fetchStub.on('POST /api/auth/refresh', () => ok(tokens('1')));
    await expect(session.getAccessToken()).resolves.toBe('access-1');
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null });
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
    fetchStub = stubFetch({ 'POST /api/auth/refresh': () => ok(tokens('1')) });
    await create().restore();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null });
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null });
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: null });
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
    expect(onSignIn).toHaveBeenCalledWith(user);
    await expect(session.getAccessToken()).resolves.toBe('access-1');
  });

  it('leaves the state untouched when the credentials are wrong', async () => {
    useSessionStore.setState({ status: 'signedOut', endedBy: null });
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: 'user' });
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    await expect(session.getAccessToken()).resolves.toBeNull();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await new Promise(process.nextTick);
    const logout = fetchStub.requests.find((request) => request.url.endsWith('/logout'));
    expect(await bodyOf(logout!)).toEqual({ refreshToken: 'refresh-1' });
    unsubscribe();
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
    fetchStub.on('POST /api/auth/refresh', () => ok(tokens('2')));
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
    pending.resolve(ok(tokens('2')));
    await expect(results).resolves.toEqual(['access-2', 'access-2', 'access-2']);
    expect(fetchStub.requests.filter((request) => request.url.endsWith('/refresh'))).toHaveLength(
      1,
    );
  });

  it('reuses a token renewed while a request was in flight', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => ok(tokens('2')));
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
    fetchStub.on('POST /api/auth/logout', () => ok(null));
    const renewal = session.refreshAfterRejection('access-1');
    await new Promise(process.nextTick);
    await session.signOut();
    pending.resolve(ok(tokens('late')));
    await expect(renewal).resolves.toBeNull();
    await new Promise(process.nextTick);
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(await secure.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    const revoked = await Promise.all(
      fetchStub.requests.filter((request) => request.url.endsWith('/logout')).map(bodyOf),
    );
    expect(revoked).toContainEqual({ refreshToken: 'refresh-late' });
  });

  it('ends the session when the server refuses the renewal', async () => {
    const session = await signedIn();
    fetchStub.on('POST /api/auth/refresh', () => failure(401, 'Reused refresh token'));
    await expect(session.refreshAfterRejection('access-1')).resolves.toBeNull();
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: 'expired' });
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
      'POST /api/auth/logout': () => ok(null),
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null });
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
    expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: 'user' });
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(fetchStub.requests.some((sent) => sent.url.endsWith('/refresh'))).toBe(false);
  });

  it('still reuses a token renewed by its own session', async () => {
    const session = create();
    await session.signIn({ email: user.email, password: 'pw' });
    fetchStub.on('POST /api/auth/refresh', () => ok(tokens('2')));
    const request = await inFlight(session, '/api/items');
    clock = 900_000; // the session renews while the request is in flight
    await expect(session.getAccessToken()).resolves.toBe('access-2');
    request.held.resolve(failure(401, 'Expired token'));

    expect((await request.response).status).toBe(201);
    expect(request.authorizations).toEqual(['Bearer access-1', 'Bearer access-2']);
  });
});
