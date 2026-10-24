import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../prisma/generated/client.js';
import { PushOutboxService } from './push-outbox.service.js';
import { PUSH_TEMPLATE_REGISTRY } from './push.templates.js';
import type { PushOptions } from './push.types.js';

const options = (enabled: boolean): PushOptions => ({
  enabled,
  accessToken: undefined,
  baseUrl: 'https://push.example.test',
  maxAttempts: 5,
});

function txWith(devices: { id: string }[]) {
  return {
    device: { findMany: vi.fn(() => Promise.resolve(devices)) },
    pushMessage: {
      createMany: vi.fn((args: { data: unknown[] }) =>
        Promise.resolve({ count: args.data.length }),
      ),
    },
  };
}

describe('PushOutboxService', () => {
  it('queues nothing while push is off', async () => {
    const outbox = new PushOutboxService(options(false), PUSH_TEMPLATE_REGISTRY);
    const tx = txWith([{ id: 'd1' }]);
    await expect(
      outbox.enqueue(tx as unknown as Prisma.TransactionClient, {
        kind: 'password_changed',
        userId: 'u1',
      }),
    ).resolves.toBe(0);
    expect(tx.device.findMany).not.toHaveBeenCalled();
    expect(outbox.enabled).toBe(false);
  });

  it("queues one notification per working device of the account, in the caller's transaction", async () => {
    vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') });
    const outbox = new PushOutboxService(options(true), PUSH_TEMPLATE_REGISTRY);
    const tx = txWith([{ id: 'd1' }, { id: 'd2' }]);
    await expect(
      outbox.enqueue(tx as unknown as Prisma.TransactionClient, {
        kind: 'password_changed',
        userId: 'u1',
        requestId: 'req-1',
      }),
    ).resolves.toBe(2);
    expect(tx.device.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', disabledAt: null },
      select: { id: true },
    });
    const expiresAt = new Date(Date.now() + PUSH_TEMPLATE_REGISTRY.password_changed.ttlMs);
    expect(tx.pushMessage.createMany).toHaveBeenCalledWith({
      data: ['d1', 'd2'].map((deviceId) => ({
        kind: 'password_changed',
        userId: 'u1',
        deviceId,
        payload: {},
        expiresAt,
        requestId: 'req-1',
      })),
    });
    vi.useRealTimers();
  });

  it('queues nothing for an account without a device', async () => {
    const outbox = new PushOutboxService(options(true), PUSH_TEMPLATE_REGISTRY);
    const tx = txWith([]);
    await expect(
      outbox.enqueue(tx as unknown as Prisma.TransactionClient, {
        kind: 'password_changed',
        userId: 'u1',
      }),
    ).resolves.toBe(0);
    expect(tx.pushMessage.createMany).not.toHaveBeenCalled();
  });

  it("wakes this process's worker after the commit, when one is listening", () => {
    const outbox = new PushOutboxService(options(true), PUSH_TEMPLATE_REGISTRY);
    expect(() => {
      outbox.notifyQueued();
    }).not.toThrow();
    const listener = vi.fn();
    outbox.onQueued(listener);
    outbox.notifyQueued();
    expect(listener).toHaveBeenCalledOnce();
  });
});
