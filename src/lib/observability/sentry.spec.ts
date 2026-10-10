import * as Sentry from '@sentry/react-native';

import { REDACTED, REDACTED_EMAIL } from './redact';
import { scrubBreadcrumb, scrubEvent, startSentry } from './sentry';

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
