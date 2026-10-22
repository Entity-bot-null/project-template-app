import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/rate-limit.store.js';
import {
  accountKeyOf,
  RateLimitGuard,
  rateLimitOptions,
  RouteRateLimit,
} from './rate-limit.guard.js';

class Routes {
  @RouteRateLimit({ limit: 2, ttlSec: 60 })
  perIp(): void {
    // A route with a tighter limit of its own, per client IP.
  }

  @RouteRateLimit({ limit: 2, ttlSec: 60, per: 'email', ipCeiling: { limit: 3, ttlSec: 60 } })
  signIn(): void {
    // Per address tried and client IP, with a ceiling per IP.
  }

  @RouteRateLimit({ limit: 2, ttlSec: 60, per: 'user' })
  changePassword(): void {
    // Per signed-in user.
  }

  list(): void {
    // A route with the global limit only.
  }
}

type Handler = 'perIp' | 'signIn' | 'changePassword' | 'list';

interface Sent {
  ip?: string;
  body?: unknown;
  /** The user the request's access token names (verified by the caller's function). */
  user?: string;
}

function request(handler: Handler, { ip = '203.0.113.7', body, user }: Sent = {}) {
  const headers: Record<string, unknown> = {};
  const res = {
    header: (name: string, value: unknown) => {
      headers[name] = value;
    },
    setHeader: (name: string, value: unknown) => {
      headers[name] = value;
    },
  };
  const req = { ip, headers: {}, body, user };
  const context = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

const stores: InMemoryRateLimitStore[] = [];

async function guardWith(globalLimit: number) {
  const storage = new InMemoryRateLimitStore();
  stores.push(storage);
  // Stands in for the access token check: the spec puts the user on the request.
  const signedInUser = vi.fn((req: { user?: string }) => Promise.resolve(req.user));
  const guard = new RateLimitGuard(
    rateLimitOptions(storage, { limit: globalLimit, windowSec: 60 }, signedInUser as never),
    storage,
    new Reflector(),
  );
  await guard.onModuleInit();
  const attempt = (handler: Handler, sent?: Sent) =>
    guard.canActivate(request(handler, sent).context);
  return { guard, storage, attempt, signedInUser };
}

afterEach(() => {
  for (const storage of stores.splice(0)) storage.onApplicationShutdown();
});

describe('RateLimitGuard', () => {
  it('counts a route limit on top of a looser global one', async () => {
    const { attempt } = await guardWith(100);
    await expect(attempt('perIp')).resolves.toBe(true);
    await expect(attempt('perIp')).resolves.toBe(true);
    await expect(attempt('perIp')).rejects.toBeInstanceOf(ThrottlerException);
    // Another route is not affected by that route's own limit.
    await expect(attempt('list')).resolves.toBe(true);
  });

  it('keeps the global limit on a route with a looser limit of its own', async () => {
    const { attempt } = await guardWith(1);
    await expect(attempt('perIp')).resolves.toBe(true);
    await expect(attempt('perIp')).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('answers with the standard Retry-After whichever limit blocked', async () => {
    const { guard, attempt } = await guardWith(100);
    await attempt('perIp');
    await attempt('perIp');
    const { context, headers } = request('perIp');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ThrottlerException);
    expect(headers['Retry-After']).toBe('60');
    expect(headers['X-RateLimit-Limit']).toBe(100);
    expect(headers['X-RateLimit-Limit-route']).toBeUndefined();
  });

  it('keeps no route counter for routes without a limit of their own', async () => {
    const { storage, attempt } = await guardWith(100);
    for (let i = 0; i < 5; i += 1) await attempt('list');
    expect(storage.storage.size).toBe(1);
    await attempt('perIp');
    expect(storage.storage.size).toBe(3);
  });

  describe('behind one shared address (carrier NAT)', () => {
    const ada = { email: 'ada@example.test' };

    it('counts a sign-in per address tried: one person running out blocks nobody else', async () => {
      const { attempt } = await guardWith(100);
      await attempt('signIn', { body: ada });
      await attempt('signIn', { body: ada });
      await expect(attempt('signIn', { body: ada })).rejects.toBeInstanceOf(ThrottlerException);
      // The same address in another case and with spaces is the same account.
      await expect(
        attempt('signIn', { body: { email: ' ADA@example.test ' } }),
      ).rejects.toBeInstanceOf(ThrottlerException);
      await expect(attempt('signIn', { body: { email: 'grace@example.test' } })).resolves.toBe(
        true,
      );
    });

    it('still caps what one address does across accounts', async () => {
      const { attempt } = await guardWith(100);
      for (const name of ['a', 'b', 'c']) {
        await attempt('signIn', { body: { email: `${name}@example.test` } });
      }
      await expect(attempt('signIn', { body: { email: 'd@example.test' } })).rejects.toBeInstanceOf(
        ThrottlerException,
      );
      // Another address is not affected.
      await expect(
        attempt('signIn', { ip: '198.51.100.2', body: { email: 'd@example.test' } }),
      ).resolves.toBe(true);
    });

    it('counts a signed-in route per person, whatever the address', async () => {
      const { attempt } = await guardWith(100);
      await attempt('changePassword', { user: 'u1' });
      await attempt('changePassword', { user: 'u1', ip: '198.51.100.2' });
      await expect(
        attempt('changePassword', { user: 'u1', ip: '198.51.100.3' }),
      ).rejects.toBeInstanceOf(ThrottlerException);
      await expect(attempt('changePassword', { user: 'u2' })).resolves.toBe(true);
    });

    it('counts the global limit per signed-in user, per address and account otherwise', async () => {
      const { attempt } = await guardWith(1);
      await expect(attempt('list', { user: 'u1' })).resolves.toBe(true);
      await expect(attempt('list', { user: 'u2' })).resolves.toBe(true);
      await expect(attempt('list', { user: 'u1' })).rejects.toBeInstanceOf(ThrottlerException);
      // Without a session: per address, and per account where the route names one.
      await expect(attempt('signIn', { body: ada })).resolves.toBe(true);
      await expect(attempt('signIn', { body: { email: 'grace@example.test' } })).resolves.toBe(
        true,
      );
      await expect(attempt('list')).resolves.toBe(true);
      await expect(attempt('list')).rejects.toBeInstanceOf(ThrottlerException);
    });

    it('verifies a request’s token once, however many throttlers count it', async () => {
      const { attempt, signedInUser } = await guardWith(100);
      await attempt('changePassword', { user: 'u1' });
      expect(signedInUser).toHaveBeenCalledOnce();
    });
  });
});

describe('accountKeyOf', () => {
  const req = (body: unknown) => ({ body }) as never;

  it('hashes the account a body names: no address or token is kept as a key', () => {
    const key = accountKeyOf(req({ email: 'Ada@Example.test' }), 'email');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(accountKeyOf(req({ email: ' ada@example.test' }), 'email'));
    expect(accountKeyOf(req({ token: 'T' }), 'token')).not.toBe(
      accountKeyOf(req({ token: 't' }), 'token'),
    );
  });

  it('counts a missing or malformed field as one account, which validation then refuses', () => {
    for (const body of [undefined, null, 'text', {}, { email: 42 }]) {
      expect(accountKeyOf(req(body), 'email')).toBe('-');
    }
  });
});
