import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../../test/app.js';
import { asUser, seedUser, signIn } from '../../../test/auth.js';
import { PUSH_MAX_ATTEMPTS, PUSH_OPTIONS } from './push.constants.js';
import type { ExpoPushMessage, PushOptions } from './push.types.js';
import { PushWorker } from './push-worker.service.js';

// The push outbox against the real database and a fake of Expo's push
// service (a local HTTP server that answers like docs.expo.dev describes):
// what the unit specs fake. A password change queues the notice for every
// device of the account; the worker sends it, then reads its receipt. Workers
// only send when a spec says so (runOnce, readReceipts): their own wake-ups
// are switched off.

interface FakeAnswer {
  status: number;
  body: unknown;
}

/** Expo's push service, as far as the worker uses it. */
class FakeExpo {
  readonly sends: ExpoPushMessage[][] = [];
  readonly receiptRequests: string[][] = [];
  readonly authorizations: (string | undefined)[] = [];
  onSend: (messages: ExpoPushMessage[]) => FakeAnswer = (messages) => ({
    status: 200,
    body: {
      data: messages.map((_, index) => ({
        status: 'ok',
        id: `ticket-${String(this.sends.length)}-${String(index)}`,
      })),
    },
  });
  onReceipts: (ids: string[]) => FakeAnswer = (ids) => ({
    status: 200,
    body: { data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) },
  });
  private readonly server: Server = createServer((req, res) => {
    void readJson(req).then((body) => {
      this.authorizations.push(req.headers.authorization);
      let answer: FakeAnswer;
      if (req.url === '/--/api/v2/push/send') {
        const messages = body as ExpoPushMessage[];
        answer = this.onSend(messages);
        this.sends.push(messages);
      } else if (req.url === '/--/api/v2/push/getReceipts') {
        const { ids } = body as { ids: string[] };
        this.receiptRequests.push(ids);
        answer = this.onReceipts(ids);
      } else {
        answer = { status: 404, body: { errors: [{ code: 'NOT_FOUND', message: 'Not found' }] } };
      }
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });

  async start(): Promise<string> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    return `http://127.0.0.1:${String(address.port)}/--/api/v2`;
  }

  async stop(): Promise<void> {
    this.server.close();
    await once(this.server, 'close');
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a quiet harbor at dawn';

describe('Push outbox (integration)', () => {
  let expo: FakeExpo;
  let t: TestApp;
  let worker: PushWorker;
  let ada: { id: string };

  beforeAll(async () => {
    expo = new FakeExpo();
    const baseUrl = await expo.start();
    const options: PushOptions = {
      enabled: true,
      accessToken: 'integration-access-token-0123',
      baseUrl,
      maxAttempts: PUSH_MAX_ATTEMPTS,
    };
    t = await createTestApp((builder) => builder.overrideProvider(PUSH_OPTIONS).useValue(options));
    worker = t.app.get(PushWorker);
  });

  beforeEach(async () => {
    vi.spyOn(worker, 'wake').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await resetDatabase(t.prisma);
    expo.sends.length = 0;
    expo.receiptRequests.length = 0;
    ada = await seedUser(t.prisma, { email: 'ada@example.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await t.app.close();
    await expo.stop();
  });

  async function registerDevice(installationId: string, pushToken: string) {
    await request(t.server)
      .put(`/api/devices/${installationId}`)
      .set(asUser(t.app, ada.id))
      .send({ pushToken, platform: 'android' })
      .expect(204);
    return t.prisma.device.findUniqueOrThrow({ where: { installationId } });
  }

  /** Changes Ada's password through the API, the way the app does. */
  async function changePassword(current = PASSWORD, next = NEW_PASSWORD) {
    const session = await signIn(t.server, 'ada@example.com', current);
    await request(t.server)
      .post('/api/account/password')
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .send({ currentPassword: current, newPassword: next })
      .expect(200);
  }

  const rows = () =>
    t.prisma.pushMessage.findMany({
      select: {
        id: true,
        status: true,
        attempts: true,
        ticketId: true,
        lastError: true,
        deviceId: true,
        nextAttemptAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

  /** The receipts are due now (Expo has them about 15 minutes after a send). */
  const receiptsDue = () =>
    t.prisma.pushMessage.updateMany({
      where: { status: 'sent' },
      data: { receiptCheckAt: new Date(Date.now() - 1_000) },
    });

  it('sends the password notice to every device of the account, then records its receipt', async () => {
    const phone = await registerDevice(
      '0190b6a1-0000-4000-8000-0000000000b1',
      'ExponentPushToken[phone]',
    );
    const tablet = await registerDevice(
      '0190b6a1-0000-4000-8000-0000000000b2',
      'ExponentPushToken[tablet]',
    );
    await changePassword();
    expect((await rows()).map((row) => row.status)).toEqual(['pending', 'pending']);

    await worker.runOnce();
    expect(expo.sends).toHaveLength(1);
    expect(expo.sends[0]?.map((message) => message.to).sort()).toEqual([
      'ExponentPushToken[phone]',
      'ExponentPushToken[tablet]',
    ]);
    expect(expo.sends[0]?.[0]).toMatchObject({
      title: 'Your password was changed',
      data: { url: '/settings' },
      channelId: 'default',
    });
    // Enhanced push security: the access token on every request.
    expect(expo.authorizations.at(-1)).toBe('Bearer integration-access-token-0123');
    const sent = await rows();
    expect(sent.map((row) => row.status)).toEqual(['sent', 'sent']);
    expect(new Set(sent.map((row) => row.deviceId))).toEqual(new Set([phone.id, tablet.id]));

    // Not due yet: nothing is asked.
    await worker.readReceipts();
    expect(expo.receiptRequests).toEqual([]);
    await receiptsDue();
    await worker.readReceipts();
    expect(expo.receiptRequests[0]?.sort()).toEqual(sent.map((row) => row.ticketId).sort());
    expect((await rows()).map((row) => row.status)).toEqual(['delivered', 'delivered']);
  });

  it("never sends Ada's queued notice to the phone once another account signed in on it", async () => {
    const phone = await registerDevice(
      '0190b6a1-0000-4000-8000-0000000000d1',
      'ExponentPushToken[shared-phone]',
    );
    await changePassword();
    // Before the worker sends it, Grace signs in on that phone (same app, same
    // push token): the installation moves to her (docs/authorization.md).
    const grace = await seedUser(t.prisma, { email: 'grace@example.com' });
    await request(t.server)
      .put('/api/devices/0190b6a1-0000-4000-8000-0000000000d1')
      .set(asUser(t.app, grace.id))
      .send({ pushToken: 'ExponentPushToken[shared-phone]', platform: 'android' })
      .expect(204);

    await worker.runOnce();
    expect(expo.sends).toEqual([]);
    expect(await rows()).toMatchObject([
      { deviceId: phone.id, status: 'expired', lastError: 'device_moved' },
    ]);
  });

  it('disables a device whose token is dead, at the send and at the receipt', async () => {
    const gone = await registerDevice(
      '0190b6a1-0000-4000-8000-0000000000c1',
      'ExponentPushToken[gone]',
    );
    const later = await registerDevice(
      '0190b6a1-0000-4000-8000-0000000000c2',
      'ExponentPushToken[later]',
    );
    expo.onSend = (messages) => ({
      status: 200,
      body: {
        data: messages.map((message, index) =>
          message.to === 'ExponentPushToken[gone]'
            ? {
                status: 'error',
                message: 'not registered',
                details: { error: 'DeviceNotRegistered' },
              }
            : { status: 'ok', id: `ticket-dead-${String(index)}` },
        ),
      },
    });
    expo.onReceipts = (ids) => ({
      status: 200,
      body: {
        data: Object.fromEntries(
          ids.map((id) => [
            id,
            { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          ]),
        ),
      },
    });
    try {
      await changePassword();
      await worker.runOnce();
      expect(
        (await t.prisma.device.findUniqueOrThrow({ where: { id: gone.id } })).disabledAt,
      ).not.toBeNull();
      await receiptsDue();
      await worker.readReceipts();
      expect(
        (await t.prisma.device.findUniqueOrThrow({ where: { id: later.id } })).disabledAt,
      ).not.toBeNull();
      expect((await rows()).map((row) => [row.status, row.lastError])).toEqual([
        ['failed', 'DeviceNotRegistered'],
        ['failed', 'DeviceNotRegistered'],
      ]);
      // A disabled device gets nothing more; registering again brings it back.
      await changePassword(NEW_PASSWORD, 'another quiet harbor at noon');
      expect(await t.prisma.pushMessage.count({ where: { status: 'pending' } })).toBe(0);
    } finally {
      expo.onSend = new FakeExpo().onSend;
      expo.onReceipts = new FakeExpo().onReceipts;
    }
  });

  it('backs off when the service rate limits the send, and sends once it answers', async () => {
    await registerDevice('0190b6a1-0000-4000-8000-0000000000d1', 'ExponentPushToken[busy]');
    expo.onSend = () => ({
      status: 429,
      body: { errors: [{ code: 'TOO_MANY_REQUESTS', message: 'Slow down' }] },
    });
    try {
      await changePassword();
      await worker.runOnce();
      const [waiting] = await rows();
      expect(waiting).toMatchObject({ status: 'pending', attempts: 1, lastError: 'http_429' });
      expect(waiting?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      // Not due yet: the next run sends nothing.
      await worker.runOnce();
      expect(expo.sends).toHaveLength(1);
    } finally {
      expo.onSend = new FakeExpo().onSend;
    }
    await t.prisma.pushMessage.updateMany({
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    await worker.runOnce();
    expect((await rows())[0]).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
  });

  it('sends each notification once when several instances work the queue together', async () => {
    for (let index = 0; index < 5; index += 1) {
      await registerDevice(
        `0190b6a1-0000-4000-8000-0000000000e${String(index)}`,
        `ExponentPushToken[many-${String(index)}]`,
      );
    }
    await changePassword();
    const second = await createTestApp((builder) =>
      builder.overrideProvider(PUSH_OPTIONS).useValue(t.app.get<PushOptions>(PUSH_OPTIONS)),
    );
    try {
      const otherWorker = second.app.get(PushWorker);
      vi.spyOn(otherWorker, 'wake').mockImplementation(() => undefined);
      await Promise.all([worker.runOnce(), otherWorker.runOnce()]);
    } finally {
      await second.app.close();
    }
    const tokens = expo.sends.flat().map((message) => message.to);
    expect(tokens).toHaveLength(5);
    expect(new Set(tokens).size).toBe(5);
    expect((await rows()).every((row) => row.status === 'sent')).toBe(true);
  });
});
