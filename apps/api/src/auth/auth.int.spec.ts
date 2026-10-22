import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { bearer, seedUser, sessionOf, signIn, TEST_PASSWORD } from '../../test/auth.js';
import { envelopeOf } from '../../test/http.js';
import { env } from '../env/env.js';
import { PrismaClient } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { REFRESH_REUSE_LEEWAY_SEC, SIGN_IN_RATE_LIMIT } from './auth.constants.js';
import { hashPassword } from './password.js';
import { hashRefreshToken, SessionsService } from './sessions.service.js';

const EMAIL = 'user@example.com';

describe('Auth (integration)', () => {
  let t: TestApp;

  // A fresh app per test: the rate limiter's in-memory counters start empty.
  beforeEach(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    await seedUser(t.prisma, { email: EMAIL });
  });

  afterEach(async () => {
    await t.app.close();
  });

  const refresh = (refreshToken: string) =>
    request(t.server).post('/api/auth/refresh').send({ refreshToken });
  const logout = (refreshToken: string) =>
    request(t.server).post('/api/auth/logout').send({ refreshToken });
  /** Moves a token's rotation back in time, past or within the reuse window. */
  const rotatedAgo = (refreshToken: string, sec: number) =>
    t.prisma.session.updateMany({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      data: { revokedAt: new Date(Date.now() - sec * 1000) },
    });

  it('signs in: both tokens and the user in the body, no cookie, only a hash stored', async () => {
    const res = await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: '  User@Example.com ', password: TEST_PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({
      data: { expiresIn: 900, user: { email: EMAIL, role: 'member' } },
      message: 'Signed in',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    const { accessToken, refreshToken } = sessionOf(res);
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await request(t.server).get('/api/users/me').set(bearer(accessToken)).expect(200);
    const [stored] = await t.prisma.session.findMany();
    expect(stored?.tokenHash).toBe(hashRefreshToken(refreshToken));
  });

  it('gives one answer for a wrong password and an unknown email', async () => {
    const wrong = await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: EMAIL, password: 'wrong-password' })
      .expect(401);
    const unknown = await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
    expect(wrong.body).toEqual({ data: null, message: 'Invalid email or password' });
    expect(unknown.body).toEqual(wrong.body);
  });

  it('validates the body before touching the database, naming every field at fault', async () => {
    const res = await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: 'not-an-email' })
      .expect(400);
    const body = envelopeOf(res) as ReturnType<typeof envelopeOf> & {
      errors: { path: string; message: string }[];
    };
    expect(body.data).toBeNull();
    expect(body.message).toMatch(/email/);
    expect(body.errors.map(({ path }) => path).sort()).toEqual(['email', 'password']);
  });

  it('rotates the refresh token: a new pair and the user; the access token works', async () => {
    const first = await signIn(t.server, EMAIL);
    const res = await refresh(first.refreshToken).expect(200);
    const next = sessionOf(res);

    expect(res.body).toMatchObject({ data: { user: { email: EMAIL } } });
    expect(next.refreshToken).not.toBe(first.refreshToken);
    await request(t.server).get('/api/users/me').set(bearer(next.accessToken)).expect(200);
    await refresh(next.refreshToken).expect(200);
  });

  describe('a renewal whose answer was lost (docs/adr/0007)', () => {
    it('retried within the reuse window: a new pair; the answer never received is dead', async () => {
      const first = await signIn(t.server, EMAIL);
      // The phone lost this answer to a dropped connection...
      const lost = sessionOf(await refresh(first.refreshToken).expect(200));
      // ...and retries with the token it still holds.
      const retried = sessionOf(await refresh(first.refreshToken).expect(200));

      expect(retried.refreshToken).not.toBe(lost.refreshToken);
      await expect(
        t.prisma.session.findUnique({ where: { tokenHash: hashRefreshToken(lost.refreshToken) } }),
      ).resolves.toMatchObject({ superseded: true, revokedAt: expect.any(Date) as Date });
      await refresh(retried.refreshToken).expect(200);
    });

    it('the lost answer used later after all: two clients hold the family, which ends', async () => {
      const first = await signIn(t.server, EMAIL);
      const lost = sessionOf(await refresh(first.refreshToken).expect(200));
      const retried = sessionOf(await refresh(first.refreshToken).expect(200));

      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await refresh(lost.refreshToken).expect(401);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Refresh token reuse'));
      await refresh(retried.refreshToken).expect(401);
    });

    it('presented again past the window: theft; the family ends, the other devices stay', async () => {
      const first = await signIn(t.server, EMAIL);
      const otherDevice = await signIn(t.server, EMAIL);
      const current = sessionOf(await refresh(first.refreshToken).expect(200));
      await rotatedAgo(first.refreshToken, REFRESH_REUSE_LEEWAY_SEC + 5);

      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const replay = await refresh(first.refreshToken).expect(401);
      expect(replay.body).toEqual({ data: null, message: 'Invalid or expired session' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Refresh token reuse'));

      // The thief's copy and the victim's current token are both dead...
      await refresh(current.refreshToken).expect(401);
      // ...while the user's other sign-in is untouched.
      await refresh(otherDevice.refreshToken).expect(200);
    });

    it('presented again within the window, its successor already used: the family ends', async () => {
      const first = await signIn(t.server, EMAIL);
      const second = sessionOf(await refresh(first.refreshToken).expect(200));
      const third = sessionOf(await refresh(second.refreshToken).expect(200));

      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await refresh(first.refreshToken).expect(401);
      await refresh(third.refreshToken).expect(401);
    });
  });

  it('validates the refresh token before any lookup, and refuses an unknown one', async () => {
    const missing = await request(t.server).post('/api/auth/refresh').send({}).expect(400);
    expect(missing.body).toMatchObject({ errors: [{ path: 'refreshToken' }] });
    await refresh('not-a-token').expect(400);
    const unknown = await refresh('A'.repeat(43)).expect(401);
    expect(unknown.body).toEqual({ data: null, message: 'Invalid or expired session' });
  });

  it('refuses a sign-in whose password changed while it was being checked', async () => {
    const sessions = t.app.get(SessionsService);
    const create = sessions.create.bind(sessions);
    vi.spyOn(sessions, 'create').mockImplementationOnce(async (userId, verifiedHash) => {
      // A password change commits between the check and the session.
      await t.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword('a-brand-new-password') },
      });
      return create(userId, verifiedHash);
    });
    await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: EMAIL, password: TEST_PASSWORD })
      .expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  it('keeps the session when a renewal fails on the server side: retried, it works', async () => {
    const session = await signIn(t.server, EMAIL);
    vi.spyOn(t.app.get(SessionsService), 'rotate').mockRejectedValueOnce(
      new Error('connection terminated'),
    );
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // A 5xx: the app keeps its tokens (a database failover signs nobody out).
    await refresh(session.refreshToken).expect(500);
    await refresh(session.refreshToken).expect(200);
  });

  it('logs out: 204, the session family ends; again, or with an unknown token, still 204', async () => {
    const session = await signIn(t.server, EMAIL);
    const res = await logout(session.refreshToken).expect(204);
    expect(res.body).toEqual({});
    await refresh(session.refreshToken).expect(401);
    await logout(session.refreshToken).expect(204);
    await logout('A'.repeat(43)).expect(204);
  });

  it('logs out with a token that was just rotated: the current one dies too', async () => {
    const first = await signIn(t.server, EMAIL);
    const rotated = sessionOf(await refresh(first.refreshToken).expect(200));
    // A sign-out that raced the renewal sends the previous token.
    await logout(first.refreshToken).expect(204);
    await refresh(rotated.refreshToken).expect(401);
  });

  it('answers a failed logout with 5xx, so the app retries it and the retry ends the session', async () => {
    const session = await signIn(t.server, EMAIL);
    vi.spyOn(t.app.get(SessionsService), 'retire').mockRejectedValueOnce(
      new Error('connection terminated'),
    );
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await logout(session.refreshToken).expect(500);
    await logout(session.refreshToken).expect(204);
    await expect(t.prisma.session.count({ where: { revokedAt: null } })).resolves.toBe(0);
    await refresh(session.refreshToken).expect(401);
  });

  it('gives every sign-in a family of its own: signing in again ends no other device', async () => {
    const phone = await signIn(t.server, EMAIL);
    const tablet = await signIn(t.server, EMAIL);
    await refresh(phone.refreshToken).expect(200);
    await refresh(tablet.refreshToken).expect(200);
  });

  it('refuses what another site made a browser send, on every route; the app passes', async () => {
    const session = await signIn(t.server, EMAIL);
    await request(t.server)
      .post('/api/auth/sign-in')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Origin', 'https://attacker.example.net')
      .send({ email: EMAIL, password: TEST_PASSWORD })
      .expect(403);
    // A sibling subdomain is "same-site", not same-origin: refused too.
    await request(t.server)
      .post('/api/auth/sign-in')
      .set('Sec-Fetch-Site', 'same-site')
      .set('Origin', 'https://sibling.example.com')
      .send({ email: EMAIL, password: TEST_PASSWORD })
      .expect(403);
    await request(t.server)
      .get('/api/users/me')
      .set(bearer(session.accessToken))
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
    // The app sends neither header (native code, not a browser).
    await refresh(session.refreshToken).expect(200);
  });

  it('refuses cross-site requests before they count against the rate limit', async () => {
    for (let attempt = 0; attempt <= SIGN_IN_RATE_LIMIT.limit; attempt += 1) {
      await request(t.server)
        .post('/api/auth/sign-in')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ email: EMAIL, password: 'wrong-password' })
        .expect(403);
    }
    // Another site cannot lock a visitor out of signing in.
    await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: EMAIL, password: TEST_PASSWORD })
      .expect(200);
  });

  it('limits sign-in attempts per address tried', async () => {
    for (let attempt = 0; attempt < SIGN_IN_RATE_LIMIT.limit; attempt += 1) {
      await request(t.server)
        .post('/api/auth/sign-in')
        .send({ email: EMAIL, password: 'wrong-password' })
        .expect(401);
    }
    const blocked = await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: EMAIL, password: TEST_PASSWORD })
      .expect(429);
    expect(blocked.body).toEqual({ data: null, message: 'Too many requests, retry later' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  // Two renewals of one token at once (a retry sent while the first is still
  // running): the user's row lock runs them one after the other, and the
  // second is a retry within the reuse window. Both succeed; the last one's
  // pair is the live one, the first one's is superseded. That is the answer
  // the phone waits for: it dropped the first request when it retried. The
  // family is never left without a live session, and never has two.
  it('serializes concurrent renewals of one token: both answer, the last pair lives', async () => {
    const first = await signIn(t.server, EMAIL);
    const results = await Promise.all([1, 2].map(() => refresh(first.refreshToken)));
    expect(results.map((res) => res.status)).toEqual([200, 200]);

    const live = await t.prisma.session.findMany({ where: { revokedAt: null } });
    expect(live).toHaveLength(1);
    const pairs = results.map((res) => sessionOf(res).refreshToken);
    const winner = pairs.find((token) => hashRefreshToken(token) === live[0]?.tokenHash);
    expect(winner).toBeDefined();
    await refresh(winner ?? '').expect(200);
  });

  it('settles concurrent renewals the same way whatever isolation the database defaults to', async () => {
    // A database or role configured with a stricter default isolation (a
    // managed service's parameter, a DBA's choice): every transaction of this
    // client starts SERIALIZABLE unless it says otherwise.
    const url = new URL(env.DATABASE_URL);
    url.searchParams.set('options', '-c default_transaction_isolation=serializable');
    const strict = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }),
    });
    try {
      await expect(strict.$queryRaw`SHOW default_transaction_isolation`).resolves.toEqual([
        { default_transaction_isolation: 'serializable' },
      ]);
      // The service only needs the client's queries and transactions.
      const sessions = new SessionsService(strict as unknown as PrismaService);
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const { refreshToken } = await signIn(t.server, EMAIL);
      const outcomes = await Promise.allSettled(
        Array.from({ length: 5 }, () => sessions.rotate(refreshToken)),
      );

      // Every one a retry within the window, none a serialization failure (a
      // 500, and a database error alert).
      expect(outcomes.map(({ status }) => status)).toEqual(Array(5).fill('fulfilled'));
      await expect(t.prisma.session.count({ where: { revokedAt: null } })).resolves.toBe(1);
    } finally {
      await strict.$disconnect();
    }
  });

  it('leaves no live session when a logout races a renewal of the same token', async () => {
    const first = await signIn(t.server, EMAIL);
    const [refreshed] = await Promise.all([
      refresh(first.refreshToken),
      logout(first.refreshToken),
    ]);
    await expect(t.prisma.session.count({ where: { revokedAt: null } })).resolves.toBe(0);
    if (refreshed.status === 200) {
      await refresh(sessionOf(refreshed).refreshToken).expect(401);
    }
  });
});
