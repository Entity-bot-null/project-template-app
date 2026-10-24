import { Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DevicesService } from './devices.service.js';

const INSTALLATION = '0190b6a1-0000-4000-8000-000000000001';
const TOKEN = 'ExponentPushToken[abc123]';
const registration = { pushToken: TOKEN, platform: 'android' as const, kind: 'expo' as const };

function setup({ previous = null as { userId: string } | null, deleted = 1 } = {}) {
  const tx = {
    device: {
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
      findUnique: vi.fn(() => Promise.resolve(previous)),
      upsert: vi.fn(() => Promise.resolve({ id: 'd1' })),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    device: { deleteMany: vi.fn(() => Promise.resolve({ count: deleted })) },
  };
  return { service: new DevicesService(prisma as unknown as PrismaService), prisma, tx };
}

let log: MockInstance<Logger['log']>;
beforeEach(() => {
  log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

describe('DevicesService.register', () => {
  it('takes the token from any other installation, then upserts this one for the caller', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') });
    const { service, tx } = setup();
    await service.register('u1', INSTALLATION, registration, ' 1.4.0 ');
    expect(tx.device.deleteMany).toHaveBeenCalledWith({
      where: { pushToken: TOKEN, NOT: { installationId: INSTALLATION } },
    });
    const data = {
      userId: 'u1',
      pushToken: TOKEN,
      platform: 'android',
      kind: 'expo',
      appVersion: '1.4.0',
      lastSeenAt: new Date('2026-10-22T12:00:00Z'),
      // A registration brings a disabled device back.
      disabledAt: null,
    };
    expect(tx.device.upsert).toHaveBeenCalledWith({
      where: { installationId: INSTALLATION },
      create: { installationId: INSTALLATION, ...data },
      update: data,
      select: { id: true },
    });
    expect(log).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps the app version only when it is one', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') });
    const data = {
      userId: 'u1',
      pushToken: TOKEN,
      platform: 'android',
      kind: 'expo',
      appVersion: null,
      lastSeenAt: new Date('2026-10-22T12:00:00Z'),
      disabledAt: null,
    };
    for (const header of [undefined, 'banana', '']) {
      const { service, tx } = setup();
      await service.register('u1', INSTALLATION, registration, header);
      expect(tx.device.upsert).toHaveBeenCalledWith({
        where: { installationId: INSTALLATION },
        create: { installationId: INSTALLATION, ...data },
        update: data,
        select: { id: true },
      });
    }
  });

  it('moves an installation registered by another account to the caller, and says so', async () => {
    const { service } = setup({ previous: { userId: 'u2' } });
    await service.register('u1', INSTALLATION, registration, undefined);
    expect(log).toHaveBeenCalledWith(`Installation ${INSTALLATION} moved to user u1`);
    log.mockClear();
    await setup({ previous: { userId: 'u1' } }).service.register(
      'u1',
      INSTALLATION,
      registration,
      undefined,
    );
    expect(log).not.toHaveBeenCalled();
  });
});

describe('DevicesService.unregister', () => {
  it("removes only the caller's installation, and answers 404 for any other", async () => {
    const { service, prisma } = setup();
    await service.unregister('u1', INSTALLATION);
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({
      where: { installationId: INSTALLATION, userId: 'u1' },
    });
    await expect(setup({ deleted: 0 }).service.unregister('u1', INSTALLATION)).rejects.toThrow(
      NotFoundException,
    );
  });
});
