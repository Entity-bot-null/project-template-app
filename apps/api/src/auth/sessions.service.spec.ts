import { Logger, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  REFRESH_FAMILY_MAX_AGE_SEC,
  REFRESH_REUSE_LEEWAY_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from './auth.constants.js';
import { hashRefreshToken, SessionsService } from './sessions.service.js';

const USER = {
  id: '0190b6a1-0000-7000-8000-000000000001',
  email: 'user@example.com',
  name: 'User',
  role: 'member' as const,
};
const PASSWORD_HASH = '$argon2id$v=19$stored';
const FAMILY = '0190b6a1-0000-7000-8000-00000000000a';
const OTHER_FAMILY = '0190b6a1-0000-7000-8000-00000000000b';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  familyExpiresAt: Date;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotated: boolean;
  superseded: boolean;
  replacedById: string | null;
}

interface Where {
  id?: string;
  userId?: string;
  familyId?: string;
  tokenHash?: string;
  revokedAt?: null;
}

const matches = (row: Row, where: Where) =>
  (where.id === undefined || row.id === where.id) &&
  (where.userId === undefined || row.userId === where.userId) &&
  (where.familyId === undefined || row.familyId === where.familyId) &&
  (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
  (where.revokedAt !== null || row.revokedAt === null);

// An in-memory stand-in for the sessions table, enough for the rotation
// rules. The real queries, locks and constraints are exercised by
// auth.int.spec.ts against PostgreSQL.
function fakePrisma(rows: Row[], storedPasswordHash = PASSWORD_HASH) {
  const session = {
    findUnique: vi.fn(({ where }: { where: Where }) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) return Promise.resolve(null);
      const successor = rows.find((candidate) => candidate.id === row.replacedById);
      return Promise.resolve({
        ...row,
        user: { ...USER, securityVersion: 4 },
        replacedBy: successor ? { id: successor.id, revokedAt: successor.revokedAt } : null,
      });
    }),
    update: vi.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) return Promise.reject(new Error('Record to update not found'));
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
    updateMany: vi.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return Promise.resolve({ count: hit.length });
    }),
    create: vi.fn(
      ({
        data,
      }: {
        data: Omit<Row, 'id' | 'revokedAt' | 'rotated' | 'superseded' | 'replacedById'>;
      }) => {
        const row: Row = {
          ...data,
          id: `s${rows.length + 1}`,
          revokedAt: null,
          rotated: false,
          superseded: false,
          replacedById: null,
        };
        rows.push(row);
        return Promise.resolve(row);
      },
    ),
    deleteMany: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(() =>
      Promise.resolve({ passwordHash: storedPasswordHash, securityVersion: 4 }),
    ),
  };
  // The user row lock (SELECT ... FOR UPDATE).
  const $queryRaw = vi.fn().mockResolvedValue([]);
  const tx = { session, user, $queryRaw };
  const prisma = {
    ...tx,
    $transaction: <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
  };
  return { prisma: prisma as unknown as PrismaService, session, $queryRaw };
}

function rowFor(token: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `row-${token}`,
    userId: USER.id,
    familyId: FAMILY,
    familyExpiresAt: new Date(Date.now() + 3_600_000),
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    rotated: false,
    superseded: false,
    replacedById: null,
    ...overrides,
  };
}

/** `token`, rotated `sec` seconds ago into `successor` (a row of its own). */
function rotatedInto(token: string, sec: number, successor: Row): Row {
  return rowFor(token, {
    revokedAt: new Date(Date.now() - sec * 1000),
    rotated: true,
    replacedById: successor.id,
  });
}

describe('SessionsService', () => {
  it('starts a family on sign-in and stores only the hash of the token', async () => {
    const rows: Row[] = [];
    const { prisma, $queryRaw } = fakePrisma(rows);
    const issued = await new SessionsService(prisma).create(USER.id, PASSWORD_HASH);
    expect($queryRaw).toHaveBeenCalled();

    expect(issued.token).toMatch(/^[\w-]{43}$/);
    // The access token is minted with the version read under the lock.
    expect(issued.securityVersion).toBe(4);
    expect(rows[0]?.tokenHash).toBe(hashRefreshToken(issued.token));
    expect(rows[0]?.tokenHash).not.toContain(issued.token);
    expect(rows[0]?.familyId).toMatch(/^[0-9a-f-]{36}$/);
    const now = Date.now();
    expect(issued.expiresAt.getTime() - now).toBeGreaterThan((REFRESH_TOKEN_TTL_SEC - 5) * 1000);
    expect((rows[0]?.familyExpiresAt.getTime() ?? 0) - now).toBeGreaterThan(
      (REFRESH_FAMILY_MAX_AGE_SEC - 5) * 1000,
    );
  });

  it('starts no family when the password changed after it was verified', async () => {
    const rows: Row[] = [];
    const { prisma } = fakePrisma(rows, '$argon2id$v=19$changed');
    await expect(new SessionsService(prisma).create(USER.id, PASSWORD_HASH)).rejects.toThrow(
      'Invalid email or password',
    );
    expect(rows).toEqual([]);
  });

  it('rotates a valid token within its family, under the user lock', async () => {
    const rows = [rowFor('old')];
    const { prisma, $queryRaw } = fakePrisma(rows);
    const { user, session } = await new SessionsService(prisma).rotate('old');

    // The public user; the version only for the access token.
    expect(user).toEqual(USER);
    expect(session.securityVersion).toBe(4);
    expect(session.token).toMatch(/^[\w-]{43}$/);
    expect(rows[1]).toMatchObject({
      tokenHash: hashRefreshToken(session.token),
      familyId: FAMILY,
      familyExpiresAt: rows[0]?.familyExpiresAt,
      revokedAt: null,
    });
    expect(rows[0]).toMatchObject({
      rotated: true,
      revokedAt: expect.any(Date) as Date,
      replacedById: rows[1]?.id,
    });
    expect($queryRaw).toHaveBeenCalled();
  });

  it('never extends a session past the end of its family', async () => {
    const familyExpiresAt = new Date(Date.now() + 60_000);
    const { prisma } = fakePrisma([rowFor('old', { familyExpiresAt })]);
    const { session } = await new SessionsService(prisma).rotate('old');
    expect(session.expiresAt).toEqual(familyExpiresAt);
  });

  it('refuses an unknown or expired token', async () => {
    const { prisma } = fakePrisma([rowFor('old', { expiresAt: new Date(Date.now() - 1) })]);
    const service = new SessionsService(prisma);
    await expect(service.rotate('unknown')).rejects.toThrow(UnauthorizedException);
    await expect(service.rotate('old')).rejects.toThrow('Invalid or expired session');
  });

  it('refuses a token revoked by logout without touching other families', async () => {
    const rows = [
      rowFor('old', { revokedAt: new Date() }),
      rowFor('other', { familyId: OTHER_FAMILY }),
    ];
    const { prisma } = fakePrisma(rows);
    await expect(new SessionsService(prisma).rotate('old')).rejects.toThrow(
      'Invalid or expired session',
    );
    expect(rows[1]?.revokedAt).toBeNull();
  });

  describe('a token presented again (docs/adr/0007)', () => {
    it('within the reuse window, its successor unused: a retried renewal gets a new pair', async () => {
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const lost = rowFor('lost');
      const old = rotatedInto('old', 1, lost);
      const firstRotation = old.revokedAt;
      const rows = [lost, old];
      const { prisma } = fakePrisma(rows);
      const { session } = await new SessionsService(prisma).rotate('old');

      const created = rows[2];
      expect(created).toMatchObject({
        tokenHash: hashRefreshToken(session.token),
        familyId: FAMILY,
        revokedAt: null,
      });
      // The successor whose answer was lost: revoked, and marked so a late
      // use of it reads as reuse.
      expect(lost).toMatchObject({ revokedAt: expect.any(Date) as Date, superseded: true });
      // The retried token now points at the new successor; the window keeps
      // the first rotation's time, so retries never stretch it.
      expect(old).toMatchObject({ replacedById: created?.id, revokedAt: firstRotation });
    });

    it('retried again within the window: each retry replaces the previous answer', async () => {
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const lost = rowFor('lost');
      const rows = [lost, rotatedInto('old', 1, lost)];
      const { prisma } = fakePrisma(rows);
      const service = new SessionsService(prisma);
      const second = await service.rotate('old');
      const third = await service.rotate('old');

      expect(
        rows.find((row) => row.tokenHash === hashRefreshToken(second.session.token)),
      ).toMatchObject({
        superseded: true,
      });
      expect(
        rows.find((row) => row.tokenHash === hashRefreshToken(third.session.token)),
      ).toMatchObject({
        superseded: false,
        revokedAt: null,
      });
    });

    it('past the window: theft, the whole family (and only it) ends, named in the log', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const current = rowFor('current');
      const rows = [
        current,
        rotatedInto('stolen', REFRESH_REUSE_LEEWAY_SEC + 5, current),
        rowFor('other device', { familyId: OTHER_FAMILY }),
      ];
      const { prisma } = fakePrisma(rows);
      await expect(new SessionsService(prisma).rotate('stolen')).rejects.toThrow(
        'Invalid or expired session',
      );
      expect(current.revokedAt).toBeInstanceOf(Date);
      expect(rows[2]?.revokedAt).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(USER.id));
    });

    it('within the window but its successor already used: another client holds the family, which ends', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const latest = rowFor('latest');
      const used = rotatedInto('used', 0, latest);
      const rows = [latest, used, rotatedInto('old', 1, used)];
      const { prisma } = fakePrisma(rows);
      await expect(new SessionsService(prisma).rotate('old')).rejects.toThrow(
        'Invalid or expired session',
      );
      expect(latest.revokedAt).toBeInstanceOf(Date);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('(at refresh)'));
    });

    it('a superseded successor presented later: two clients hold the family, which ends', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const current = rowFor('current');
      const rows = [
        current,
        rowFor('superseded', { revokedAt: new Date(Date.now() - 1000), superseded: true }),
      ];
      const { prisma } = fakePrisma(rows);
      await expect(new SessionsService(prisma).rotate('superseded')).rejects.toThrow(
        'Invalid or expired session',
      );
      expect(current.revokedAt).toBeInstanceOf(Date);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(USER.id));
    });
  });

  it('ends the family of the token presented at logout, whatever its state', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const current = rowFor('current');
    const rows = [
      current,
      rotatedInto('previous', 1, current),
      rowFor('other device', { familyId: OTHER_FAMILY }),
    ];
    const { prisma } = fakePrisma(rows);
    await new SessionsService(prisma).retire('previous');
    expect(current.revokedAt).toBeInstanceOf(Date);
    expect(rows[2]?.revokedAt).toBeNull();
    // Within the window: a renewal's lost answer, not a theft.
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports a token rotated long ago, or superseded, presented at logout as theft', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const current = rowFor('current');
    const { prisma } = fakePrisma([
      current,
      rotatedInto('stolen', REFRESH_REUSE_LEEWAY_SEC + 5, current),
      rowFor('superseded', { familyId: OTHER_FAMILY, revokedAt: new Date(), superseded: true }),
    ]);
    const service = new SessionsService(prisma);
    await service.retire('stolen');
    expect(current.revokedAt).toBeInstanceOf(Date);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('(at logout)'));
    warn.mockClear();
    await service.retire('superseded');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('(at logout)'));
  });

  it('ignores an unknown token at logout', async () => {
    const rows = [rowFor('mine')];
    const { prisma } = fakePrisma(rows);
    await expect(new SessionsService(prisma).retire('unknown')).resolves.toBeUndefined();
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it('ends every session of a user at once', async () => {
    const rows = [
      rowFor('one'),
      rowFor('two', { familyId: OTHER_FAMILY }),
      rowFor('someone else', { userId: '0190b6a1-0000-7000-8000-000000000002' }),
    ];
    const { prisma, $queryRaw } = fakePrisma(rows);
    await new SessionsService(prisma).revokeAll(USER.id);
    expect(rows.map((row) => row.revokedAt !== null)).toEqual([true, true, false]);
    expect($queryRaw).toHaveBeenCalled();
  });

  it('reports how many expired sessions a sweep removed, and survives a failure', async () => {
    const { prisma, session } = fakePrisma([]);
    const service = new SessionsService(prisma);
    session.deleteMany.mockResolvedValueOnce({ count: 3 });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(service.sweep()).resolves.toBe(3);

    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    session.deleteMany.mockRejectedValueOnce(new Error('database down'));
    await expect(service.sweep()).resolves.toBe(0);
    expect(warn).toHaveBeenCalledWith('Session sweep failed: database down');
  });
});
