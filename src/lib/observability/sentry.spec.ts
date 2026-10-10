import * as Sentry from '@sentry/react-native';
import type { TransactionEvent } from '@sentry/react-native';

import { REDACTED, REDACTED_EMAIL } from './redact';
import { scrubBreadcrumb, scrubEvent, scrubTransaction, startSentry } from './sentry';

const sdk = jest.mocked(Sentry);
const DSN = 'https://key@o1.ingest.example.com/1';

describe('startSentry', () => {
  it('starts with every collection of personal data off', () => {
    startSentry({ dsn: DSN, environment: 'staging', tracesSampleRate: 0 });
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'staging',
        sendDefaultPii: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        enableCaptureFailedRequests: false,
        beforeSend: scrubEvent,
        beforeSendTransaction: scrubTransaction,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
    expect(sdk.setTag).toHaveBeenCalledWith('update.id', 'embedded');
  });

  it('reports with level and tags, breadcrumbs and an opaque user id', () => {
    const reporter = startSentry({ dsn: DSN, environment: 'production', tracesSampleRate: 0 });
    const error = new Error('boom');
    reporter.capture(error, { level: 'fatal', tags: { feature: 'items' } });
    expect(sdk.captureException).toHaveBeenCalledWith(error);
    reporter.addBreadcrumb({
      category: 'network',
      message: 'GET /api/items',
      data: { status: 500 },
    });
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: 'network',
      message: 'GET /api/items',
      level: 'info',
      data: { status: 500 },
    });
    reporter.setUser('user-1');
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    reporter.setUser(null);
    expect(sdk.setUser).toHaveBeenLastCalledWith(null);
  });
});

describe('scrubEvent', () => {
  it('keeps nothing personal or secret in what is sent', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'failed for a@example.com',
      exception: { values: [{ type: 'Error', value: `Bearer ${'t'.repeat(20)}` }] },
      request: {
        method: 'POST',
        url: 'https://api.example.com/api/auth/sign-in?redirect=x',
        headers: { Authorization: 'Bearer abc' },
        cookies: { session: 'abc' },
        data: { password: 'hunter2' },
      },
      user: { id: 'user-1', email: 'a@example.com', ip_address: '203.0.113.7' },
      extra: { refreshToken: 'refresh-secret-1' },
      contexts: { app: { apiKey: 'k' } },
      breadcrumbs: [
        { category: 'console', message: 'debug password=hunter2' },
        {
          category: 'fetch',
          data: { url: 'https://api.example.com/x?token=abc', body: '{"password":"x"}' },
        },
      ],
    });
    expect(event.message).toBe(`failed for ${REDACTED_EMAIL}`);
    expect(event.exception?.values?.[0]?.value).toBe(`Bearer ${REDACTED}`);
    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/api/auth/sign-in',
    });
    expect(event.user).toEqual({ id: 'user-1' });
    expect(event.extra).toEqual({ refreshToken: REDACTED });
    expect(event.contexts).toEqual({ app: { apiKey: REDACTED } });
    expect(event.breadcrumbs).toEqual([
      { category: 'fetch', data: { url: 'https://api.example.com/x' } },
    ]);
    expect(JSON.stringify(event)).not.toMatch(/hunter2|refresh-secret-1|203\.0\.113\.7/);
  });

  it('drops a user without an id', () => {
    const event = scrubEvent({ type: undefined, user: { email: 'a@example.com' } });
    expect(event.user).toEqual({});
  });
});

describe('transactions (performance tracing on)', () => {
  const TRACE = { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) };
  const SEARCH = 'https://api.example.com/api/items?limit=20&offset=0&q=groceries';

  /** A span of a request, as the SDK records it (see the first test below). */
  function requestSpan(type: 'fetch' | 'xhr') {
    return {
      ...TRACE,
      span_id: type === 'fetch' ? 'c'.repeat(16) : 'd'.repeat(16),
      parent_span_id: TRACE.span_id,
      start_timestamp: 1,
      timestamp: 2,
      op: 'http.client',
      origin: 'auto.http.browser' as const,
      description: 'GET https://api.example.com/api/items',
      data: {
        url: SEARCH,
        type,
        'http.method': 'GET',
        'http.url': SEARCH,
        'server.address': 'api.example.com',
        'http.query': '?limit=20&offset=0&q=groceries',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.browser',
      },
    };
  }

  /** What the SDK sends for a transaction: what the hook given to Sentry.init returns. */
  async function sent(event: TransactionEvent): Promise<TransactionEvent | null> {
    const hook = sdk.init.mock.lastCall?.[0].beforeSendTransaction;
    return hook ? await hook(event, {}) : event;
  }

  it('keeps what the user searched for out of the request spans', async () => {
    // With tracing on, the SDK (10.x) strips the query from a request span's
    // name only: its data keeps the full URL (`url`, `http.url`) and the
    // query apart (`http.query`), for fetch (@sentry/core, fetch.js
    // getFetchSpanAttributes) and XHR (@sentry/browser, tracing/request.js).
    // beforeSend never sees transactions.
    startSentry({ dsn: DSN, environment: 'production', tracesSampleRate: 0.2 });
    const event = await sent({
      type: 'transaction',
      transaction: 'ItemsScreen',
      contexts: { trace: { ...TRACE, op: 'ui.action' } },
      spans: [requestSpan('fetch'), requestSpan('xhr')],
    });

    expect(JSON.stringify(event)).not.toContain('groceries');
    expect(event?.spans?.map((span) => span.data)).toEqual(
      (['fetch', 'xhr'] as const).map((type) => ({
        url: 'https://api.example.com/api/items',
        type,
        'http.method': 'GET',
        'http.url': 'https://api.example.com/api/items',
        'server.address': 'api.example.com',
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.browser',
      })),
    );
    expect(event?.spans?.[0]?.description).toBe('GET https://api.example.com/api/items');
  });

  it('scrubs the rest of a transaction as it scrubs an error report', async () => {
    startSentry({ dsn: DSN, environment: 'production', tracesSampleRate: 1 });
    const event = await sent({
      type: 'transaction',
      transaction: 'GET /api/items?q=groceries',
      request: {
        url: 'https://api.example.com/api/items?q=groceries',
        headers: { Authorization: 'Bearer abc' },
      },
      user: { id: 'user-1', email: 'a@example.com' },
      extra: { refreshToken: 'refresh-secret-1' },
      contexts: {
        trace: { ...TRACE, data: { url: '/api/items?q=groceries', 'http.fragment': '#top' } },
      },
      spans: [
        {
          ...requestSpan('fetch'),
          description: 'search https://api.example.com/api/items?q=groceries for a@example.com',
          data: {},
        },
      ],
      breadcrumbs: [{ category: 'console', message: 'debug password=hunter2' }],
    });

    expect(event?.transaction).toBe('GET /api/items');
    expect(event?.request).toEqual({ url: 'https://api.example.com/api/items' });
    expect(event?.user).toEqual({ id: 'user-1' });
    expect(event?.extra).toEqual({ refreshToken: REDACTED });
    expect(event?.contexts?.trace?.data).toEqual({ url: '/api/items' });
    expect(event?.spans?.[0]?.description).toBe(
      `search https://api.example.com/api/items for ${REDACTED_EMAIL}`,
    );
    expect(event?.breadcrumbs).toEqual([]);
    expect(JSON.stringify(event)).not.toMatch(/groceries|refresh-secret-1|a@example\.com|hunter2/);
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console output and request bodies, strips query strings', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'anything' })).toBeNull();
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        message: 'to a@example.com',
        data: { from: '/items?q=private', to: '/settings', request_body: 'x', response_body: 'y' },
      }),
    ).toEqual({
      category: 'navigation',
      message: `to ${REDACTED_EMAIL}`,
      data: { from: '/items', to: '/settings' },
    });
  });
});
