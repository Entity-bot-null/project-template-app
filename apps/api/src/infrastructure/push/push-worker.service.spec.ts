import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '../../common/http/external-http.js';
import { disabledErrorTracker, setErrorTracker } from '../../observability/error-tracker.js';
import { MalformedPushResponseError } from './expo-push.client.js';
import {
  PUSH_POLL_INTERVAL_MS,
  PUSH_RECEIPT_DELAY_MS,
  PUSH_RECEIPT_POLL_INTERVAL_MS,
  PUSH_RECEIPT_WINDOW_MS,
  PUSH_STATS_INTERVAL_MS,
  PUSH_SWEEP_INTERVAL_MS,
} from './push.constants.js';
import type { PushOutboxService } from './push-outbox.service.js';
import type { PushOutboxStats, PushStore } from './push.store.js';
import { PUSH_TEMPLATE_REGISTRY, type PushTemplates } from './push.templates.js';
import type {
  ClaimedReceipt,
  ClaimedSend,
  ExpoReceipt,
  ExpoTicket,
  PushClient,
  PushOptions,
} from './push.types.js';
import { classifySendError, PushWorker } from './push-worker.service.js';

const metrics = vi.hoisted(() => ({
  recordPushDelivery: vi.fn(),
  recordPushDeviceDisabled: vi.fn(),
  observePushOutbox: vi.fn(),
}));
vi.mock('../../observability/metrics.js', () => metrics);

const options: PushOptions = {
  enabled: true,
  accessToken: undefined,
  baseUrl: 'https://push.example.test',
  maxAttempts: 3,
};

let nextId = 0;
type Claimed = ClaimedSend;
function push(overrides: Partial<Claimed> = {}): Claimed {
  nextId += 1;
  return {
    id: `p${String(nextId)}`,
    kind: 'password_changed',
    userId: 'u1',
    deviceId: `d${String(nextId)}`,
    pushToken: `ExponentPushToken[t${String(nextId)}]`,
    payload: {},
    attempts: 1,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(Date.now() - 1_000),
    requestId: null,
    deviceDisabled: false,
    deviceMoved: false,
    ...overrides,
  };
}

function receipt(overrides: Partial<ClaimedReceipt> = {}): ClaimedReceipt {
  nextId += 1;
  return {
    id: `p${String(nextId)}`,
    kind: 'password_changed',
    deviceId: `d${String(nextId)}`,
    ticketId: `ticket-${String(nextId)}`,
    attempts: 1,
    sentAt: new Date(Date.now() - PUSH_RECEIPT_DELAY_MS),
    ...overrides,
  };
}

interface Setup {
  batches?: Claimed[][];
  receiptBatches?: ClaimedReceipt[][];
  send?: PushClient['send'];
  receipts?: PushClient['receipts'];
  enabled?: boolean;
  templates?: PushTemplates;
  stats?: PushOutboxStats;
}

function setup({
  batches = [],
  receiptBatches = [],
  send = (messages) =>
    Promise.resolve(messages.map((_, index) => ({ status: 'ok', id: `t-${String(index)}` }))),
  receipts = () => Promise.resolve({}),
  enabled = true,
  templates = PUSH_TEMPLATE_REGISTRY,
  stats = { waiting: 0, oldestAgeSeconds: 0 },
}: Setup = {}) {
  const store = {
    claim: vi.fn(() => Promise.resolve(batches.shift() ?? [])),
    claimReceipts: vi.fn(() => Promise.resolve(receiptBatches.shift() ?? [])),
    markSent: vi.fn(() => Promise.resolve(true)),
    reschedule: vi.fn(() => Promise.resolve(true)),
    markFailed: vi.fn(() => Promise.resolve(true)),
    markExpired: vi.fn(() => Promise.resolve(true)),
    markDelivered: vi.fn(() => Promise.resolve(true)),
    markReceiptFailed: vi.fn(() => Promise.resolve(true)),
    recheckReceipt: vi.fn(() => Promise.resolve(true)),
    resendLater: vi.fn(() => Promise.resolve(true)),
    disableDevice: vi.fn(() => Promise.resolve(true)),
    disableDeviceUnchangedSince: vi.fn(() => Promise.resolve(true)),
    stats: vi.fn(() => Promise.resolve(stats)),
    sweep: vi.fn(() => Promise.resolve({ expired: 0, deleted: 0, devices: 0 })),
  };
  let queuedListener: (() => void) | undefined;
  const outbox = {
    enabled,
    onQueued: (listener: () => void) => {
      queuedListener = listener;
    },
  };
  const client = { send: vi.fn(send), receipts: vi.fn(receipts) };
  const worker = new PushWorker(
    store as unknown as PushStore,
    outbox as unknown as PushOutboxService,
    options,
    client,
    templates,
  );
  workers.push(worker);
  return { worker, store, client, notify: () => queuedListener?.() };
}

/** Starts the worker and waits for what it did at once (stats, sweep, a drain). */
async function started(context: ReturnType<typeof setup>) {
  context.worker.onApplicationBootstrap();
  await vi.waitFor(() => {
    expect(context.store.sweep).toHaveBeenCalled();
  });
  await context.worker.idle();
  return context;
}

const logs = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
let workers: PushWorker[] = [];

beforeEach(() => {
  logs.log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  logs.warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  logs.error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  metrics.recordPushDelivery.mockClear();
  metrics.recordPushDeviceDisabled.mockClear();
});
afterEach(async () => {
  for (const worker of workers) await worker.onModuleDestroy();
  workers = [];
  setErrorTracker(disabledErrorTracker);
});

function trackErrors() {
  const capture = vi.fn();
  setErrorTracker({ ...disabledErrorTracker, capture });
  return capture;
}

describe('PushWorker, push off', () => {
  it('only sweeps: no drain, no receipts, health "disabled"', async () => {
    const context = await started(setup({ enabled: false, batches: [[push()]] }));
    context.worker.wake();
    await context.worker.runOnce();
    await context.worker.readReceipts();
    expect(context.store.claim).not.toHaveBeenCalled();
    expect(context.store.claimReceipts).not.toHaveBeenCalled();
    expect(context.worker.health()).toBe('disabled');
  });
});

describe('PushWorker, sending', () => {
  it('sends a batch in one request, rendered from its kind, and records each ticket', async () => {
    const first = push();
    const second = push();
    const context = await started(setup({ batches: [[first, second]] }));
    expect(context.client.send).toHaveBeenCalledOnce();
    expect(context.client.send).toHaveBeenCalledWith([
      {
        to: first.pushToken,
        title: 'Your password was changed',
        body: 'If it was not you, reset your password now.',
        data: { url: '/settings' },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      },
      expect.objectContaining({ to: second.pushToken }),
    ]);
    expect(context.store.markSent).toHaveBeenNthCalledWith(1, first, 't-0', PUSH_RECEIPT_DELAY_MS);
    expect(context.store.markSent).toHaveBeenNthCalledWith(2, second, 't-1', PUSH_RECEIPT_DELAY_MS);
    expect(metrics.recordPushDelivery).toHaveBeenCalledWith('password_changed', 'sent');
    expect(context.worker.health()).toBe('ok');
  });

  it('disables the device of a dead token and gives up on its notification', async () => {
    const dead = push();
    const send = (): Promise<ExpoTicket[]> =>
      Promise.resolve([
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]);
    const context = await started(setup({ batches: [[dead]], send }));
    expect(context.store.disableDevice).toHaveBeenCalledWith(dead.deviceId, dead.pushToken);
    expect(metrics.recordPushDeviceDisabled).toHaveBeenCalledOnce();
    expect(context.store.markFailed).toHaveBeenCalledWith(dead, 'DeviceNotRegistered');
    expect(metrics.recordPushDelivery).toHaveBeenCalledWith('password_changed', 'unregistered');
  });

  it('does not count a device disabled already (or registered again since)', async () => {
    const send = (): Promise<ExpoTicket[]> =>
      Promise.resolve([
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]);
    const context = setup({ batches: [[push()]], send });
    context.store.disableDevice.mockResolvedValue(false);
    await started(context);
    expect(metrics.recordPushDeviceDisabled).not.toHaveBeenCalled();
  });

  it('retries a notification the service rate limited, and gives up on one it refused', async () => {
    const limited = push();
    const tooBig = push();
    const odd = push();
    const send = (): Promise<ExpoTicket[]> =>
      Promise.resolve([
        { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
        { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
        { status: 'error', message: 'what', details: { error: 'not a code!' } },
      ]);
    const context = await started(setup({ batches: [[limited, tooBig, odd]], send }));
    expect(context.store.reschedule).toHaveBeenCalledWith(
      limited,
      expect.any(Number),
      'MessageRateExceeded',
    );
    expect(context.store.markFailed).toHaveBeenCalledWith(tooBig, 'MessageTooBig');
    // Only Expo's codes reach the outbox, never its text.
    expect(context.store.markFailed).toHaveBeenCalledWith(odd, 'unknown');
  });

  it('reports refused credentials to the error tracker', async () => {
    const capture = trackErrors();
    const send = (): Promise<ExpoTicket[]> =>
      Promise.resolve([
        { status: 'error', message: 'bad', details: { error: 'InvalidCredentials' } },
      ]);
    await started(setup({ batches: [[push()]], send }));
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      level: 'error',
      origin: 'dependency',
      dependency: 'expo-push',
    });
  });

  it('retries a notification left without a ticket, as a malformed answer', async () => {
    const answered = push();
    const unanswered = push();
    const send = (): Promise<ExpoTicket[]> => Promise.resolve([{ status: 'ok', id: 't-0' }]);
    const context = await started(setup({ batches: [[answered, unanswered]], send }));
    expect(context.store.markSent).toHaveBeenCalledWith(answered, 't-0', PUSH_RECEIPT_DELAY_MS);
    expect(context.store.reschedule).toHaveBeenCalledWith(
      unanswered,
      expect.any(Number),
      'malformed_response',
    );
  });

  it('retries the whole batch when the service fails, and degrades the health meanwhile', async () => {
    const batch = [push(), push()];
    const send = () => Promise.reject(new ExternalServiceError('expo-push', 'status', 503));
    const context = await started(setup({ batches: [batch], send }));
    for (const claim of batch) {
      expect(context.store.reschedule).toHaveBeenCalledWith(claim, expect.any(Number), 'http_503');
    }
    expect(context.worker.health()).toBe('degraded');
    expect(context.worker.health(Date.now() + 16 * 60_000)).toBe('ok');
  });

  it('gives up on a notification out of attempts when the service keeps failing', async () => {
    const last = push({ attempts: 3 });
    const send = () => Promise.reject(new ExternalServiceError('expo-push', 'timeout'));
    const context = await started(setup({ batches: [[last]], send }));
    expect(context.store.markFailed).toHaveBeenCalledWith(last, 'timeout');
    expect(context.store.reschedule).not.toHaveBeenCalled();
  });

  it('reports refused credentials of the request, and logs what it did not expect', async () => {
    const capture = trackErrors();
    const send = () => Promise.reject(new ExternalServiceError('expo-push', 'status', 401));
    await started(setup({ batches: [[push()]], send }));
    expect(capture).toHaveBeenCalledOnce();
    const odd = await started(
      setup({ batches: [[push()]], send: () => Promise.reject(new Error('boom')) }),
    );
    expect(odd.store.reschedule).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      'unexpected',
    );
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected error sending'));
  });

  it('drops what can no longer be sent without asking the service', async () => {
    const exhausted = push({ attempts: 4 });
    const late = push({ expiresAt: new Date(Date.now() - 1) });
    const disabled = push({ deviceDisabled: true });
    const moved = push({ deviceMoved: true });
    const inapplicable = push();
    const templates = {
      password_changed: { ttlMs: 60_000, render: vi.fn(() => null) },
    } as unknown as PushTemplates;
    const context = await started(
      setup({ batches: [[exhausted, late, disabled, moved, inapplicable]], templates }),
    );
    expect(context.client.send).not.toHaveBeenCalled();
    expect(context.store.markFailed).toHaveBeenCalledWith(exhausted, 'attempts_exhausted');
    expect(context.store.markExpired).toHaveBeenCalledWith(late, 'expired');
    expect(context.store.markExpired).toHaveBeenCalledWith(disabled, 'device_disabled');
    expect(context.store.markExpired).toHaveBeenCalledWith(moved, 'device_moved');
    expect(context.store.markExpired).toHaveBeenCalledWith(inapplicable, 'not_applicable');
  });

  it('warns when a ticket arrives after its lease ran out', async () => {
    const context = setup({ batches: [[push()]] });
    context.store.markSent.mockResolvedValue(false);
    await started(context);
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('its lease had run out'));
  });

  it('wakes on a commit, drains again when woken meanwhile, and pauses when the database fails', async () => {
    const context = await started(setup());
    context.store.claim.mockResolvedValueOnce([push()]).mockResolvedValueOnce([]);
    context.notify();
    context.worker.wake();
    await context.worker.idle();
    await vi.waitFor(() => {
      expect(context.client.send).toHaveBeenCalledOnce();
    });
    await context.worker.idle();
    context.store.claim.mockRejectedValueOnce(new Error('connection lost'));
    await context.worker.runOnce();
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Push worker paused'));
  });

  it('is degraded while notifications wait longer than 15 minutes', async () => {
    const context = await started(setup({ stats: { waiting: 4, oldestAgeSeconds: 16 * 60 } }));
    await vi.waitFor(() => {
      expect(context.worker.health()).toBe('degraded');
    });
    expect(metrics.observePushOutbox).toHaveBeenCalled();
  });
});

describe('PushWorker, receipts', () => {
  it('records what Apple and Google took, and asks again for receipts not there yet', async () => {
    const delivered = receipt();
    const pending = receipt();
    const lost = receipt({ sentAt: new Date(Date.now() - PUSH_RECEIPT_WINDOW_MS) });
    const context = await started(
      setup({
        receiptBatches: [[delivered, pending, lost]],
        receipts: () => Promise.resolve({ [delivered.ticketId]: { status: 'ok' } }),
      }),
    );
    await context.worker.readReceipts();
    expect(context.client.receipts).toHaveBeenCalledWith([
      delivered.ticketId,
      pending.ticketId,
      lost.ticketId,
    ]);
    expect(context.store.markDelivered).toHaveBeenCalledWith(delivered);
    expect(context.store.recheckReceipt).toHaveBeenCalledWith(pending, PUSH_RECEIPT_DELAY_MS);
    expect(context.store.markReceiptFailed).toHaveBeenCalledWith(lost, 'no_receipt');
    expect(metrics.recordPushDelivery).toHaveBeenCalledWith('password_changed', 'delivered');
  });

  it('disables a device the receipt says is gone, resends a rate limited one, gives up on the rest', async () => {
    const capture = trackErrors();
    const gone = receipt();
    const limited = receipt();
    const limitedLast = receipt({ attempts: 3 });
    const refused = receipt();
    const error = (code: string): ExpoReceipt => ({
      status: 'error',
      message: 'no',
      details: { error: code },
    });
    const context = await started(
      setup({
        receiptBatches: [[gone, limited, limitedLast, refused]],
        receipts: () =>
          Promise.resolve({
            [gone.ticketId]: error('DeviceNotRegistered'),
            [limited.ticketId]: error('MessageRateExceeded'),
            [limitedLast.ticketId]: error('MessageRateExceeded'),
            [refused.ticketId]: error('MismatchSenderId'),
          }),
      }),
    );
    await context.worker.readReceipts();
    expect(context.store.disableDeviceUnchangedSince).toHaveBeenCalledWith(
      gone.deviceId,
      gone.sentAt,
    );
    expect(context.store.markReceiptFailed).toHaveBeenCalledWith(gone, 'DeviceNotRegistered');
    expect(context.store.resendLater).toHaveBeenCalledWith(
      limited,
      expect.any(Number),
      'MessageRateExceeded',
    );
    expect(context.store.markReceiptFailed).toHaveBeenCalledWith(
      limitedLast,
      'MessageRateExceeded',
    );
    expect(context.store.markReceiptFailed).toHaveBeenCalledWith(refused, 'MismatchSenderId');
    expect(capture).toHaveBeenCalledOnce();
    expect(metrics.recordPushDeviceDisabled).toHaveBeenCalledOnce();
  });

  it('asks again later when the receipts cannot be read, and pauses when the database fails', async () => {
    const claimed = receipt();
    const context = await started(
      setup({
        receiptBatches: [[claimed]],
        receipts: () => Promise.reject(new ExternalServiceError('expo-push', 'network')),
      }),
    );
    await context.worker.readReceipts();
    expect(context.store.recheckReceipt).toHaveBeenCalledWith(claimed, PUSH_RECEIPT_DELAY_MS);
    context.store.claimReceipts.mockRejectedValueOnce(new Error('connection lost'));
    await context.worker.readReceipts();
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Push receipts paused'));
  });

  it('runs one pass at a time', async () => {
    const context = await started(setup({ receiptBatches: [[receipt()]] }));
    await Promise.all([context.worker.readReceipts(), context.worker.readReceipts()]);
    expect(context.client.receipts).toHaveBeenCalledOnce();
  });
});

describe('PushWorker, housekeeping', () => {
  it('logs what the sweep removed, and warns when the sweep or the stats fail', async () => {
    const context = setup();
    context.store.sweep.mockResolvedValueOnce({ expired: 1, deleted: 2, devices: 3 });
    context.store.stats.mockRejectedValueOnce(new Error('down'));
    await started(context);
    await vi.waitFor(() => {
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Push retention'));
    });
    expect(logs.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not read the push queue'),
    );
    const failing = setup();
    failing.store.sweep.mockRejectedValueOnce(new Error('down'));
    failing.worker.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(logs.warn).toHaveBeenCalledWith(
        expect.stringContaining('Push retention sweep failed'),
      );
    });
  });

  it('keeps working on its timers: due notifications, receipts, the queue, the sweep', async () => {
    vi.useFakeTimers();
    try {
      const context = setup();
      context.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      const { claim, claimReceipts, stats, sweep } = context.store;
      const before = [claim, claimReceipts, stats, sweep].map((fn) => fn.mock.calls.length);
      await vi.advanceTimersByTimeAsync(PUSH_POLL_INTERVAL_MS);
      expect(claim.mock.calls.length).toBeGreaterThan(before[0]!);
      await vi.advanceTimersByTimeAsync(PUSH_STATS_INTERVAL_MS);
      expect(stats.mock.calls.length).toBeGreaterThan(before[2]!);
      await vi.advanceTimersByTimeAsync(PUSH_RECEIPT_POLL_INTERVAL_MS);
      expect(claimReceipts.mock.calls.length).toBeGreaterThan(before[1]!);
      await vi.advanceTimersByTimeAsync(PUSH_SWEEP_INTERVAL_MS);
      expect(sweep.mock.calls.length).toBeGreaterThan(before[3]!);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweeps on its timer with push off too', async () => {
    vi.useFakeTimers();
    try {
      const context = setup({ enabled: false });
      context.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(PUSH_SWEEP_INTERVAL_MS);
      expect(context.store.sweep).toHaveBeenCalledTimes(2);
      expect(context.store.claim).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the batch being sent when the API stops', async () => {
    let finish: (tickets: ExpoTicket[]) => void = () => undefined;
    const context = setup({
      batches: [[push()]],
      send: () =>
        new Promise<ExpoTicket[]>((resolve) => {
          finish = resolve;
        }),
    });
    context.worker.onApplicationBootstrap();
    await vi.waitFor(() => {
      expect(context.client.send).toHaveBeenCalled();
    });
    const stopping = context.worker.onModuleDestroy();
    finish([{ status: 'ok', id: 't' }]);
    await stopping;
    expect(context.store.markSent).toHaveBeenCalled();
  });
});

describe('classifySendError', () => {
  it('names the failure, and marks refused credentials as configuration', () => {
    expect(classifySendError(new ExternalServiceError('x', 'timeout'))).toEqual({
      category: 'timeout',
      configuration: false,
    });
    expect(classifySendError(new ExternalServiceError('x', 'status', 429))).toEqual({
      category: 'http_429',
      configuration: false,
    });
    expect(classifySendError(new ExternalServiceError('x', 'status', 403))).toEqual({
      category: 'http_403',
      configuration: true,
    });
    expect(classifySendError(new MalformedPushResponseError('send'))).toEqual({
      category: 'malformed_response',
      configuration: false,
    });
    expect(classifySendError('?')).toEqual({ category: 'unexpected', configuration: false });
  });
});
