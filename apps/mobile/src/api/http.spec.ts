import { AppError } from '@/lib/errors';
import {
  disabledReporter,
  type ErrorReporter,
  setErrorReporter,
} from '@/lib/observability/errorReporter';

import {
  APP_BUILD_HEADER,
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  type AuthHandlers,
  createHttp,
  pathOf,
  REQUEST_ID_HEADER,
} from './http';

function request(path = '/api/items', init?: RequestInit): Request {
  return new Request(`https://api.example.com${path}`, init);
}

function respond(status: number): Response {
  return new Response('{}', { status });
}

function auth(overrides: Partial<AuthHandlers> = {}): jest.Mocked<AuthHandlers> {
  return {
    getAccessToken: jest.fn(() => Promise.resolve('token-1')),
    refreshAfterRejection: jest.fn(() => Promise.resolve('token-2')),
    ...overrides,
  } as jest.Mocked<AuthHandlers>;
}

describe('createHttp', () => {
  it('sends JSON accept and a request id, without a token on public endpoints', async () => {
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(200)));
    await createHttp({ fetch })(request());
    const sent = fetch.mock.calls[0]?.[0];
    expect(sent?.headers.get('Accept')).toBe('application/json');
    expect(sent?.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f]{32}$/);
    expect(sent?.headers.has('Authorization')).toBe(false);
  });

  it("keeps a caller's request id", async () => {
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(200)));
    await createHttp({ fetch })(request('/x', { headers: { [REQUEST_ID_HEADER]: 'abc' } }));
    expect(fetch.mock.calls[0]?.[0].headers.get(REQUEST_ID_HEADER)).toBe('abc');
  });

  it('tells the API its platform, version and build, leaving out what it does not know', async () => {
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(200)));
    await createHttp({ fetch, client: { platform: 'android', version: '1.4.0', build: '57' } })(
      request(),
    );
    const sent = fetch.mock.calls[0]?.[0];
    expect(sent?.headers.get(APP_PLATFORM_HEADER)).toBe('android');
    expect(sent?.headers.get(APP_VERSION_HEADER)).toBe('1.4.0');
    expect(sent?.headers.get(APP_BUILD_HEADER)).toBe('57');

    await createHttp({ fetch, client: { platform: 'ios', version: null, build: null } })(request());
    const unknown = fetch.mock.calls[1]?.[0];
    expect(unknown?.headers.get(APP_PLATFORM_HEADER)).toBe('ios');
    expect(unknown?.headers.has(APP_VERSION_HEADER)).toBe(false);
    expect(unknown?.headers.has(APP_BUILD_HEADER)).toBe(false);
  });

  it('passes a 426 on, once, and still answers with it', async () => {
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(426)));
    const onUpgradeRequired = jest.fn();
    const response = await createHttp({ fetch, onUpgradeRequired })(request());
    expect(response.status).toBe(426);
    expect(onUpgradeRequired).toHaveBeenCalledTimes(1);
    // Any other answer says nothing about the version.
    fetch.mockResolvedValueOnce(respond(400));
    await createHttp({ fetch, onUpgradeRequired })(request());
    expect(onUpgradeRequired).toHaveBeenCalledTimes(1);
  });

  it("adds the session's token", async () => {
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(200)));
    await createHttp({ fetch, auth: auth() })(request());
    expect(fetch.mock.calls[0]?.[0].headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('replays a 401 once with the renewed token, body included', async () => {
    const handlers = auth();
    const fetch = jest
      .fn<Promise<Response>, [Request]>()
      .mockResolvedValueOnce(respond(401))
      .mockResolvedValueOnce(respond(200));
    const response = await createHttp({ fetch, auth: handlers })(
      request('/api/items', { method: 'POST', body: JSON.stringify({ title: 'x' }) }),
    );
    expect(response.status).toBe(200);
    expect(handlers.refreshAfterRejection).toHaveBeenCalledWith('token-1');
    const replay = fetch.mock.calls[1]?.[0];
    expect(replay?.headers.get('Authorization')).toBe('Bearer token-2');
    expect(await replay?.text()).toBe('{"title":"x"}');
  });

  it('never loops: a second 401 is the answer', async () => {
    const handlers = auth();
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(401)));
    const response = await createHttp({ fetch, auth: handlers })(request());
    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(handlers.refreshAfterRejection).toHaveBeenCalledTimes(1);
  });

  it('does not replay when the session ended or nothing changed', async () => {
    for (const renewed of [null, 'token-1']) {
      const fetch = jest.fn((_request: Request) => Promise.resolve(respond(401)));
      const handlers = auth({ refreshAfterRejection: jest.fn(() => Promise.resolve(renewed)) });
      expect((await createHttp({ fetch, auth: handlers })(request())).status).toBe(401);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('does not refresh for a request sent without a token', async () => {
    const handlers = auth({ getAccessToken: jest.fn(() => Promise.resolve(null)) });
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(401)));
    await createHttp({ fetch, auth: handlers })(request());
    expect(handlers.refreshAfterRejection).not.toHaveBeenCalled();
  });

  it('turns a failure without an answer into a network error', async () => {
    const fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    await expect(createHttp({ fetch })(request())).rejects.toMatchObject({ kind: 'network' });
  });

  it('times out a request that does not answer', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn(
      (sent: Request) =>
        new Promise<Response>((_resolve, reject) => {
          sent.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const pending = createHttp({ fetch, timeoutMs: 1000 })(request());
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    jest.useRealTimers();
  });

  it("forwards the caller's cancellation", async () => {
    const controller = new AbortController();
    const fetch = jest.fn(
      (sent: Request) =>
        new Promise<Response>((_resolve, reject) => {
          sent.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const pending = createHttp({ fetch })(request('/x', { signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      createHttp({ fetch })(request('/x', { signal: aborted.signal })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('leaves a breadcrumb with the path only for failures', async () => {
    const reporter: jest.Mocked<ErrorReporter> = {
      enabled: true,
      capture: jest.fn(),
      addBreadcrumb: jest.fn(),
      setUser: jest.fn(),
    };
    setErrorReporter(reporter);
    const fetch = jest.fn((_request: Request) => Promise.resolve(respond(503)));
    await createHttp({ fetch })(
      request('/api/items?q=secret', { headers: { [REQUEST_ID_HEADER]: 'r1' } }),
    );
    expect(reporter.addBreadcrumb).toHaveBeenCalledWith({
      category: 'network',
      level: 'error',
      message: 'GET /api/items',
      data: { status: 503, requestId: 'r1' },
    });
    setErrorReporter(disabledReporter);
  });
});

describe('pathOf', () => {
  it('drops origin, query and fragment', () => {
    expect(pathOf('https://api.example.com/api/items?q=1#x')).toBe('/api/items');
    expect(pathOf('https://api.example.com')).toBe('/');
  });
});
