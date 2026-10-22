import { JwtService } from '@nestjs/jwt';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { asUser, seedUser } from '../../test/auth.js';
import { rateLimitOptions } from '../common/guards/rate-limit.guard.js';
import {
  RATE_LIMIT_STORE,
  type RateLimitStore,
} from '../infrastructure/rate-limit/rate-limit.store.js';
import {
  PASSWORD_CHANGE_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  SIGN_IN_RATE_LIMIT,
  SIGN_UP_RATE_LIMIT,
} from './auth.constants.js';
import { signedInUserOf } from './jwt-auth.guard.js';

// The routes' own limits are counted on top of the global limit: whichever is
// tighter decides. The integration env sets a very loose global limit
// (vitest.config.int.ts); one test tightens it below the sign-in limit. Every
// request here comes from one address, like phones behind a carrier NAT: the
// limits must tell their people apart (docs/security.md#rate-limiting).

const signInAttempt = (t: TestApp, email = 'nobody@example.com') =>
  request(t.server).post('/api/auth/sign-in').send({ email, password: 'wrong-password' });

describe('Auth rate limits (integration)', () => {
  const apps: TestApp[] = [];

  afterEach(async () => {
    for (const t of apps.splice(0)) await t.app.close();
  });

  async function app(globalLimit?: number): Promise<TestApp> {
    const t = await createTestApp((builder) =>
      globalLimit === undefined
        ? builder
        : builder.overrideProvider(getOptionsToken()).useFactory({
            // The application's throttlers, with a global limit of `globalLimit`.
            factory: (storage: RateLimitStore, jwt: JwtService) =>
              rateLimitOptions(storage, { limit: globalLimit, windowSec: 60 }, signedInUserOf(jwt)),
            inject: [RATE_LIMIT_STORE, JwtService],
          }),
    );
    apps.push(t);
    return t;
  }

  it('applies the sign-in limit on top of a looser global one', async () => {
    const t = await app();
    const first = await signInAttempt(t).expect(401);
    // Both limits are reported: the global one, and the route's own.
    expect(first.headers['x-ratelimit-limit']).toBe('100000');
    expect(first.headers['x-ratelimit-limit-route']).toBe(String(SIGN_IN_RATE_LIMIT.limit));
    for (let attempt = 1; attempt < SIGN_IN_RATE_LIMIT.limit; attempt += 1) {
      await signInAttempt(t).expect(401);
    }
    const blocked = await signInAttempt(t).expect(429);
    expect(blocked.body).toEqual({ data: null, message: 'Too many requests, retry later' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts sign-ins per address tried: one person locked out blocks nobody else behind the IP', async () => {
    const t = await app();
    for (let attempt = 0; attempt < SIGN_IN_RATE_LIMIT.limit; attempt += 1) {
      await signInAttempt(t, 'ada@example.com').expect(401);
    }
    await signInAttempt(t, 'ADA@example.com').expect(429);
    await signInAttempt(t, 'grace@example.com').expect(401);
  });

  it('applies the global limit to sign-in too, when it is the tighter one', async () => {
    const t = await app(3);
    for (let attempt = 0; attempt < 3; attempt += 1) await signInAttempt(t).expect(401);
    const blocked = await signInAttempt(t).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts renewals per refresh token', async () => {
    const t = await app();
    const refresh = (refreshToken: string) =>
      request(t.server).post('/api/auth/refresh').send({ refreshToken });
    for (let attempt = 0; attempt < REFRESH_RATE_LIMIT.limit; attempt += 1) {
      await refresh('A'.repeat(43)).expect(401);
    }
    await refresh('A'.repeat(43)).expect(429);
    await refresh('B'.repeat(43)).expect(401);
  });

  it('caps one address across accounts on a route that sends email', async () => {
    const t = await app();
    const ceiling = SIGN_UP_RATE_LIMIT.ipCeiling?.limit ?? 0;
    expect(ceiling).toBeGreaterThan(SIGN_UP_RATE_LIMIT.limit);
    const signUp = (index: number) =>
      request(t.server)
        .post('/api/auth/sign-ups')
        .send({ email: `person-${String(index)}@example.com`, name: 'P', password: 'x' });
    for (let index = 0; index < ceiling; index += 1) {
      const res = await signUp(index);
      expect(res.status, String(index)).not.toBe(429);
    }
    await signUp(ceiling).expect(429);
  });

  it('counts a signed-in route per person, never per address', async () => {
    const t = await app();
    await resetDatabase(t.prisma);
    const ada = await seedUser(t.prisma, { email: 'ada@example.com' });
    const grace = await seedUser(t.prisma, { email: 'grace@example.com' });
    const change = (id: string) =>
      request(t.server)
        .post('/api/account/password')
        .set(asUser(t.app, id))
        .send({ currentPassword: 'not the password', newPassword: 'violet harbour lantern 7' });
    for (let attempt = 0; attempt < PASSWORD_CHANGE_RATE_LIMIT.limit; attempt += 1) {
      await change(ada.id).expect(403);
    }
    await change(ada.id).expect(429);
    await change(grace.id).expect(403);
  });
});
