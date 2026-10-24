import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '../../common/http/external-http.js';
import { createExpoPushClient, MalformedPushResponseError } from './expo-push.client.js';
import type { ExpoPushMessage } from './push.types.js';

const BASE = 'https://push.example.test/--/api/v2';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function clientWith(answers: (() => Promise<Response>)[], accessToken?: string) {
  const fetchStub = vi.fn((_input: string | URL | Request, _init?: RequestInit) => {
    const next = answers.shift();
    if (next === undefined) throw new Error('unexpected request');
    return next();
  });
  const sleep = vi.fn(() => Promise.resolve());
  const client = createExpoPushClient({ baseUrl: BASE, accessToken }, { fetch: fetchStub, sleep });
  return { client, fetchStub, sleep };
}

const PUSH: ExpoPushMessage = {
  to: 'ExponentPushToken[abc]',
  title: 'Your password was changed',
  body: 'If it was not you, reset your password now.',
  data: { url: '/settings' },
  sound: 'default',
  priority: 'high',
  channelId: 'default',
};

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
});

describe('send', () => {
  it('posts the batch to push/send and answers one ticket per notification, in order', async () => {
    const { client, fetchStub } = clientWith([
      () =>
        json(200, {
          data: [
            { status: 'ok', id: 'ticket-1' },
            {
              status: 'error',
              message: 'not registered',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
    ]);
    await expect(client.send([PUSH, { ...PUSH, to: 'ExponentPushToken[def]' }])).resolves.toEqual([
      { status: 'ok', id: 'ticket-1' },
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
    ]);
    const [url, init] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${BASE}/push/send`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual([
      PUSH,
      { ...PUSH, to: 'ExponentPushToken[def]' },
    ]);
    // Without an access token, no Authorization header.
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('sends the access token of enhanced push security', async () => {
    const { client, fetchStub } = clientWith(
      [() => json(200, { data: [{ status: 'ok', id: 't' }] })],
      'expo-access-token-0123456789',
    );
    await client.send([PUSH]);
    const [, init] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer expo-access-token-0123456789',
    );
  });

  it('refuses an answer it cannot match back to the notifications', async () => {
    for (const body of [{ data: [] }, { data: [{ status: 'odd' }] }, { errors: [] }]) {
      const { client } = clientWith([() => json(200, body)]);
      await expect(client.send([PUSH])).rejects.toBeInstanceOf(MalformedPushResponseError);
    }
  });

  it('never retries a send itself: one request, then the failure for the worker', async () => {
    const { client, fetchStub } = clientWith([() => json(503, { errors: [] })]);
    const error = await client.send([PUSH]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as ExternalServiceError).status).toBe(503);
    expect(fetchStub).toHaveBeenCalledOnce();
  });
});

describe('receipts', () => {
  it('posts the ticket ids to push/getReceipts and answers the receipts there are', async () => {
    const { client, fetchStub } = clientWith([
      () =>
        json(200, {
          data: {
            a: { status: 'ok' },
            b: { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
          },
        }),
    ]);
    await expect(client.receipts(['a', 'b', 'c'])).resolves.toEqual({
      a: { status: 'ok' },
      b: { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
    });
    const [url, init] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${BASE}/push/getReceipts`);
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a', 'b', 'c'] });
  });

  it('retries reading receipts, which changes nothing', async () => {
    const { client, fetchStub } = clientWith([
      () => json(503, {}),
      () => json(200, { data: { a: { status: 'ok' } } }),
    ]);
    await expect(client.receipts(['a'])).resolves.toEqual({ a: { status: 'ok' } });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('refuses a malformed answer', async () => {
    const { client } = clientWith([() => json(200, { data: { a: { status: 'maybe' } } })]);
    await expect(client.receipts(['a'])).rejects.toBeInstanceOf(MalformedPushResponseError);
  });
});
