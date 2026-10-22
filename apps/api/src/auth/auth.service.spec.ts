import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TOKEN_TTL_SEC } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { dummyPasswordHash, hashPassword } from './password.js';
import type { SessionsService } from './sessions.service.js';

const USER = {
  id: '0190b6a1-0000-7000-8000-000000000001',
  email: 'user@example.com',
  name: 'User',
  role: 'member' as const,
};
const REFRESH = {
  token: 'refresh-token',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  securityVersion: 3,
};
const jwt = new JwtService({ secret: 'spec-only-secret-not-for-real-use-'.padEnd(64, '0') });

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword('right password');
});

function setup(found: (typeof USER & { passwordHash: string }) | null) {
  const findUnique = vi.fn().mockResolvedValue(found);
  const sessions = {
    create: vi.fn().mockResolvedValue(REFRESH),
    rotate: vi.fn().mockResolvedValue({ user: USER, session: { ...REFRESH, securityVersion: 5 } }),
    retire: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const service = new AuthService(prisma, jwt, sessions as unknown as SessionsService);
  return { service, findUnique, sessions };
}

describe('AuthService at boot', () => {
  it('builds the timing dummy hash, so the first unknown-email sign-in pays no extra hash', async () => {
    const { service } = setup(null);
    await service.onModuleInit();
    const started = performance.now();
    await dummyPasswordHash();
    expect(performance.now() - started).toBeLessThan(5);
  });
});

describe('AuthService', () => {
  it('signs in: a session row, both tokens in the body, an access token carrying id, role and version', async () => {
    const { service, sessions } = setup({ ...USER, passwordHash });
    const session = await service.signIn(USER.email, 'right password');

    // With the hash it verified, re-checked under the user lock.
    expect(sessions.create).toHaveBeenCalledWith(USER.id, passwordHash);
    expect(session).toMatchObject({
      refreshToken: REFRESH.token,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user: USER,
    });
    expect(session.user).not.toHaveProperty('passwordHash');
    const claims = await jwt.verifyAsync<Record<string, unknown>>(session.accessToken);
    // sv: the version SessionsService read under the user's lock.
    expect(claims).toMatchObject({ sub: USER.id, role: 'member', sv: 3 });
  });

  it('starts a family of its own at every sign-in, leaving the others alone', async () => {
    const { service, sessions } = setup({ ...USER, passwordHash });
    await service.signIn(USER.email, 'right password');
    await service.signIn(USER.email, 'right password');
    // A device that had a session logs it out itself (the app does, at sign-out).
    expect(sessions.create).toHaveBeenCalledTimes(2);
    expect(sessions.retire).not.toHaveBeenCalled();
  });

  it('looks the email up trimmed and lowercased', async () => {
    const { service, findUnique } = setup({ ...USER, passwordHash });
    await service.signIn('  User@Example.COM ', 'right password');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
  });

  it('gives one answer for a wrong password and an unknown email', async () => {
    const wrong = setup({ ...USER, passwordHash }).service.signIn(USER.email, 'wrong');
    const unknown = setup(null).service.signIn('nobody@example.com', 'whatever');
    // Both handlers attached at once: either may reject first.
    await Promise.all([
      expect(wrong).rejects.toThrow(new UnauthorizedException('Invalid email or password')),
      expect(unknown).rejects.toThrow(new UnauthorizedException('Invalid email or password')),
    ]);
  });

  it('touches no session when the credentials are wrong', async () => {
    const { service, sessions } = setup({ ...USER, passwordHash });
    await expect(service.signIn(USER.email, 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.retire).not.toHaveBeenCalled();
  });

  it('refreshes by rotating the session: a new pair and the user, as at sign-in', async () => {
    const { service, sessions } = setup(null);
    const session = await service.refresh('old-token');
    expect(sessions.rotate).toHaveBeenCalledWith('old-token');
    expect(session).toMatchObject({ refreshToken: REFRESH.token, user: USER });
    await expect(jwt.verifyAsync(session.accessToken)).resolves.toMatchObject({
      sub: USER.id,
      sv: 5,
    });
  });

  it('logs out by retiring the session family', async () => {
    const { service, sessions } = setup(null);
    await service.logout('a-token');
    expect(sessions.retire).toHaveBeenCalledWith('a-token');
  });
});
