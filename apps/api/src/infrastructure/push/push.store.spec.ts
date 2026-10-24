import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PushStore } from './push.store.js';

// The SQL itself runs against PostgreSQL in push-outbox.int.spec.ts (claims,
// leases, receipts, retention); here, what each method asks for.

const NOW = new Date('2026-10-22T12:00:00Z');

function storeWith() {
  const prisma = {
    $queryRaw: vi.fn(() => Promise.resolve([])),
    pushMessage: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 2 })),
      aggregate: vi.fn(() =>
        Promise.resolve({ _count: { _all: 0 }, _min: { createdAt: null as Date | null } }),
      ),
    },
    device: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      deleteMany: vi.fn(() => Promise.resolve({ count: 4 })),
    },
  };
  return { prisma, store: new PushStore(prisma as unknown as PrismaService) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PushStore', () => {
  it('claims a batch in one statement that skips the rows another worker is taking', async () => {
    const { prisma, store } = storeWith();
    await store.claim(100, 60_000);
    const [sql, lease, limit] = prisma.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      number,
      number,
    ];
    const statement = sql.join('?');
    expect(statement).toContain('FOR UPDATE SKIP LOCKED');
    expect(statement).toContain('"attempts" = "attempts" + 1');
    expect(statement).toContain(`("status" = 'sending' AND "locked_until" < now())`);
    // The device's token comes with the claim, and whether it was disabled since.
    expect(statement).toContain('JOIN "devices" d');
    expect(lease).toBe(60);
    expect(limit).toBe(100);
  });

  it('claims due receipts of sent notifications whose lease is free', async () => {
    const { prisma, store } = storeWith();
    await store.claimReceipts(1000, 60_000);
    const [sql, lease, limit] = prisma.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      number,
      number,
    ];
    const statement = sql.join('?');
    expect(statement).toContain(`"status" = 'sent' AND "receipt_check_at" <= now()`);
    expect(statement).toContain('FOR UPDATE SKIP LOCKED');
    expect([lease, limit]).toEqual([60, 1000]);
  });

  it('fences every send transition by the claim it was made under', async () => {
    vi.useFakeTimers({ now: NOW });
    const { prisma, store } = storeWith();
    const claim = { id: 'p1', attempts: 2 };
    await expect(store.markSent(claim, 'ticket-1', 900_000)).resolves.toBe(true);
    await store.reschedule(claim, 30_000, 'http_503');
    await store.markFailed(claim, 'MessageTooBig');
    await store.markExpired(claim, 'expired');
    const calls = prisma.pushMessage.updateMany.mock.calls as unknown as [
      { where: unknown; data: Record<string, unknown> },
    ][];
    for (const [{ where }] of calls) {
      expect(where).toEqual({ id: 'p1', status: 'sending', attempts: 2 });
    }
    expect(calls[0]?.[0].data).toEqual({
      status: 'sent',
      ticketId: 'ticket-1',
      sentAt: NOW,
      receiptCheckAt: new Date(NOW.getTime() + 900_000),
      lockedUntil: null,
      lastError: null,
    });
    expect(calls[1]?.[0].data).toMatchObject({
      status: 'pending',
      nextAttemptAt: new Date(NOW.getTime() + 30_000),
      lastError: 'http_503',
    });
    expect(calls[2]?.[0].data).toMatchObject({ status: 'failed', lastError: 'MessageTooBig' });
    expect(calls[3]?.[0].data).toMatchObject({ status: 'expired', lastError: 'expired' });
  });

  it('answers false when the claim no longer holds (another worker took it over)', async () => {
    const { prisma, store } = storeWith();
    prisma.pushMessage.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(store.markFailed({ id: 'p1', attempts: 1 }, 'x')).resolves.toBe(false);
  });

  it('fences every receipt transition by the sent row and its ticket', async () => {
    vi.useFakeTimers({ now: NOW });
    const { prisma, store } = storeWith();
    const claim = { id: 'p1', ticketId: 't1' };
    await store.markDelivered(claim);
    await store.markReceiptFailed(claim, 'DeviceNotRegistered');
    await store.recheckReceipt(claim, 900_000);
    await store.resendLater(claim, 60_000, 'MessageRateExceeded');
    const calls = prisma.pushMessage.updateMany.mock.calls as unknown as [
      { where: unknown; data: Record<string, unknown> },
    ][];
    for (const [{ where }] of calls)
      expect(where).toEqual({ id: 'p1', status: 'sent', ticketId: 't1' });
    expect(calls[0]?.[0].data).toMatchObject({ status: 'delivered', receiptCheckAt: null });
    expect(calls[1]?.[0].data).toMatchObject({
      status: 'failed',
      lastError: 'DeviceNotRegistered',
    });
    expect(calls[2]?.[0].data).toEqual({
      receiptCheckAt: new Date(NOW.getTime() + 900_000),
      lockedUntil: null,
    });
    // A new send: no ticket, no send time, a new attempt later.
    expect(calls[3]?.[0].data).toMatchObject({
      status: 'pending',
      ticketId: null,
      sentAt: null,
      receiptCheckAt: null,
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
    });
  });

  it('disables a device only while it still has the token reported dead, or has not registered since', async () => {
    const { prisma, store } = storeWith();
    await expect(store.disableDevice('d1', 'ExponentPushToken[a]')).resolves.toBe(true);
    const sentAt = new Date('2026-10-22T11:00:00Z');
    prisma.device.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(store.disableDeviceUnchangedSince('d1', sentAt)).resolves.toBe(false);
    const calls = prisma.device.updateMany.mock.calls as unknown as [{ where: unknown }][];
    expect(calls[0]?.[0].where).toEqual({
      id: 'd1',
      pushToken: 'ExponentPushToken[a]',
      disabledAt: null,
    });
    expect(calls[1]?.[0].where).toEqual({
      id: 'd1',
      disabledAt: null,
      lastSeenAt: { lte: sentAt },
    });
  });

  it('reads the queue: how many wait, and the age of the oldest', async () => {
    vi.useFakeTimers({ now: NOW });
    const { prisma, store } = storeWith();
    await expect(store.stats()).resolves.toEqual({ waiting: 0, oldestAgeSeconds: 0 });
    prisma.pushMessage.aggregate.mockResolvedValueOnce({
      _count: { _all: 3 },
      _min: { createdAt: new Date(NOW.getTime() - 90_000) },
    });
    await expect(store.stats()).resolves.toEqual({ waiting: 3, oldestAgeSeconds: 90 });
  });

  it('sweeps stale pending rows, old finished ones, and dead or stale devices', async () => {
    const { prisma, store } = storeWith();
    const now = NOW.getTime();
    await expect(store.sweep(now)).resolves.toEqual({ expired: 1, deleted: 2, devices: 4 });
    const day = 86_400_000;
    expect(prisma.pushMessage.updateMany).toHaveBeenCalledWith({
      where: { status: 'pending', expiresAt: { lt: new Date(now - day) } },
      data: { status: 'expired', lastError: 'expired' },
    });
    expect(prisma.pushMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['delivered', 'failed', 'expired'] },
        createdAt: { lt: new Date(now - 30 * day) },
      },
    });
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { disabledAt: { lt: new Date(now - 30 * day) } },
          { lastSeenAt: { lt: new Date(now - 270 * day) } },
        ],
      },
    });
  });
});
