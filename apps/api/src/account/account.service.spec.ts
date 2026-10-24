import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth/auth.service.js';
import { checkPassword, hashPassword } from '../auth/password.js';
import type { SessionsService } from '../auth/sessions.service.js';
import type { MailOutboxService } from '../infrastructure/mail/mail-outbox.service.js';
import type { PushOutboxService } from '../infrastructure/push/push-outbox.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountService, LAST_ADMIN } from './account.service.js';

// The transaction against PostgreSQL (locks, concurrent changes, sessions)
// is account.int.spec.ts; here, the order of the decisions.

const CURRENT = 'the current passphrase here';
const NEXT = 'violet harbour lantern 7';
let currentHash: string;

beforeAll(async () => {
  currentHash = await hashPassword(CURRENT);
});
beforeEach(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

interface Setup {
  /** The hash the transaction reads again under the lock. */
  storedHashInTransaction?: string;
  role?: 'admin' | 'member';
  /** Administrators counted under the lock. */
  admins?: number;
}

function setup({ storedHashInTransaction, role = 'member', admins = 1 }: Setup = {}) {
  const user = {
    id: 'u1',
    email: 'ada@example.test',
    name: 'Ada Lovelace',
    role,
    passwordHash: currentHash,
  };
  const calls: string[] = [];
  const tx = {
    $queryRaw: vi.fn(() => {
      calls.push('lock user');
      return Promise.resolve([]);
    }),
    $executeRaw: vi.fn(() => {
      calls.push('lock deletions');
      return Promise.resolve(1);
    }),
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          email: user.email,
          role,
          passwordHash: storedHashInTransaction ?? currentHash,
        }),
      ),
      update: vi.fn((args: unknown) => {
        calls.push('update user');
        return Promise.resolve(args);
      }),
      count: vi.fn(() => {
        calls.push('count administrators');
        return Promise.resolve(admins);
      }),
      delete: vi.fn((args: unknown) => {
        calls.push('delete user');
        return Promise.resolve(args);
      }),
    },
    session: {
      updateMany: vi.fn(() => {
        calls.push('revoke sessions');
        return Promise.resolve({ count: 3 });
      }),
    },
    accountToken: {
      deleteMany: vi.fn(() => {
        calls.push('drop reset links');
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const prisma = {
    user: { findUnique: vi.fn(() => Promise.resolve(user)) },
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const sessions = {
    create: vi.fn(() =>
      Promise.resolve({ token: 'new-refresh', expiresAt: new Date(), securityVersion: 5 }),
    ),
  };
  const auth = {
    sessionFor: vi.fn((authUser: unknown, session: { token: string; securityVersion: number }) =>
      Promise.resolve({
        accessToken: `token-sv-${String(session.securityVersion)}`,
        refreshToken: session.token,
        expiresIn: 900,
        user: authUser,
      }),
    ),
  };
  const mail = {
    enqueue: vi.fn(() => {
      calls.push('queue notice');
      return Promise.resolve('queued');
    }),
    notifyQueued: vi.fn(),
  };
  const push = { enqueue: vi.fn(() => Promise.resolve(1)), notifyQueued: vi.fn() };
  const service = new AccountService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    sessions as unknown as SessionsService,
    mail as unknown as MailOutboxService,
    push as unknown as PushOutboxService,
  );
  return { service, prisma, tx, sessions, auth, mail, push, calls };
}

describe('AccountService.changePassword', () => {
  it('ends every session, then starts a new one for this device, with the new password', async () => {
    const { service, tx, sessions, mail, push, calls } = setup();
    const result = await service.changePassword('u1', CURRENT, NEXT);
    expect(calls).toEqual([
      'lock user',
      'update user',
      'revoke sessions',
      'drop reset links',
      'queue notice',
    ]);
    const [[{ data }]] = tx.user.update.mock.calls as unknown as [
      [{ data: { passwordHash: string; securityVersion: unknown } }],
    ];
    expect(data.securityVersion).toEqual({ increment: 1 });
    await expect(checkPassword(data.passwordHash, NEXT)).resolves.toBe(true);
    // The new session is created with the new hash, after the old ones ended.
    expect(sessions.create).toHaveBeenCalledWith('u1', data.passwordHash);
    // The session this device adopts: both tokens, minted after the old ones ended.
    expect(result).toMatchObject({ accessToken: 'token-sv-5', refreshToken: 'new-refresh' });
    expect(result.user).toEqual({
      id: 'u1',
      email: 'ada@example.test',
      name: 'Ada Lovelace',
      role: 'member',
    });
    expect(mail.enqueue).toHaveBeenCalledWith(expect.anything(), {
      kind: 'password_changed',
      to: 'ada@example.test',
      userId: 'u1',
      payload: { changedAt: expect.any(String) as string, via: 'change' },
    });
    expect(mail.notifyQueued).toHaveBeenCalledOnce();
    // The same notice on every device of the account, in the same transaction.
    expect(push.enqueue).toHaveBeenCalledWith(tx, { kind: 'password_changed', userId: 'u1' });
    expect(push.notifyQueued).toHaveBeenCalledOnce();
  });

  it('refuses a weak new password with 400 before checking anything else', async () => {
    const { service, prisma } = setup();
    await expect(service.changePassword('u1', 'whatever', 'short')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.changePassword('u1', CURRENT, 'ada.lovelace with a long tail'),
    ).rejects.toThrow('newPassword: Leave your email address and your name out of your password.');
    // Named as the new password field's problem, for the app to mark it.
    await expect(service.changePassword('u1', CURRENT, 'short')).rejects.toMatchObject({
      errors: [{ path: 'newPassword' }],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 403 for a wrong current password: the session stays, nothing changes', async () => {
    const { service, prisma } = setup();
    await expect(service.changePassword('u1', 'not the password', NEXT)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 409 when the password changed between the check and the transaction', async () => {
    const { service, tx, sessions } = setup({ storedHashInTransaction: 'changed meanwhile' });
    await expect(service.changePassword('u1', CURRENT, NEXT)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an account that no longer exists', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.changePassword('u1', CURRENT, NEXT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AccountService.deleteAccount', () => {
  it('deletes the account under its lock, then queues a notice that belongs to no account', async () => {
    const { service, tx, mail, calls } = setup();
    await service.deleteAccount('u1', CURRENT);
    // A member: no count of administrators.
    expect(calls).toEqual(['lock deletions', 'lock user', 'delete user', 'queue notice']);
    // The cascades take what it owned: items, sessions, links, its messages.
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(mail.enqueue).toHaveBeenCalledWith(expect.anything(), {
      kind: 'account_deleted',
      to: 'ada@example.test',
      payload: { deletedAt: expect.any(String) as string },
    });
    expect(mail.notifyQueued).toHaveBeenCalledOnce();
  });

  it('answers 403 for a wrong password: the session stays, nothing changes', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteAccount('u1', 'not the password')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses the only administrator with 409; one of several may leave', async () => {
    const only = setup({ role: 'admin', admins: 1 });
    await expect(only.service.deleteAccount('u1', CURRENT)).rejects.toThrow(
      new ConflictException(LAST_ADMIN),
    );
    expect(only.tx.user.delete).not.toHaveBeenCalled();
    expect(only.mail.enqueue).not.toHaveBeenCalled();

    const several = setup({ role: 'admin', admins: 2 });
    await several.service.deleteAccount('u1', CURRENT);
    // Deletions one at a time, before the count.
    expect(several.calls).toEqual([
      'lock deletions',
      'lock user',
      'count administrators',
      'delete user',
      'queue notice',
    ]);
  });

  it('answers 409 when the password changed meanwhile, 404 when the account is gone', async () => {
    const changed = setup({ storedHashInTransaction: 'changed meanwhile' });
    await expect(changed.service.deleteAccount('u1', CURRENT)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(changed.tx.user.delete).not.toHaveBeenCalled();

    const goneMeanwhile = setup();
    goneMeanwhile.tx.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(goneMeanwhile.service.deleteAccount('u1', CURRENT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(goneMeanwhile.tx.user.delete).not.toHaveBeenCalled();

    const gone = setup();
    gone.prisma.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(gone.service.deleteAccount('u1', CURRENT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
