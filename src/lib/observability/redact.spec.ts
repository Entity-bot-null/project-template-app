import { isSensitiveKey, REDACTED, REDACTED_EMAIL, redact, redactText, redactUrl } from './redact';

// Token-shaped values are built at runtime: secret scanners rightly flag
// literal ones, test fixtures included.
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const JWT = [
  part({ alg: 'HS256', typ: 'JWT' }),
  part({ sub: 'user-1' }),
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
].join('.');

describe('redactText', () => {
  it.each([
    [
      'bearer token',
      'Authorization: Bearer abc.def-123456',
      'Authorization: [REDACTED] [REDACTED]',
    ],
    [
      'query string token',
      '/callback?code=1&access_token=abc123&state=x',
      '/callback?code=1&access_token=[REDACTED]&state=x',
    ],
    [
      'JSON field',
      '{"email_verified":true,"password":"hunter2"}',
      '{"email_verified":true,"password":"[REDACTED]"}',
    ],
    ['refresh token field', 'refreshToken: "r-123"', 'refreshToken: "[REDACTED]"'],
    [
      'URL credentials',
      // A fake credential: the input this case proves gets redacted.
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth
      'https://user:p4ss@api.example.com/v1',
      `https://user:${REDACTED}@api.example.com/v1`,
    ],
    [
      'email address',
      'sign-in failed for ana.perez+app@example.com',
      `sign-in failed for ${REDACTED_EMAIL}`,
    ],
  ])('masks a %s', (_name, input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it('masks JWTs anywhere in a string', () => {
    expect(redactText(`token was ${JWT}, rejected`)).toBe(`token was ${REDACTED}, rejected`);
  });

  it('leaves ordinary text alone', () => {
    for (const text of ['GET /api/items/42 500', 'Item created', 'status=503 requestId=abc']) {
      expect(redactText(text)).toBe(text);
    }
  });

  it('stays fast on long hostile input', () => {
    const hostile = `${'a'.repeat(20_000)}=${'b'.repeat(20_000)} ${'token: "'.repeat(2_000)}`;
    const started = Date.now();
    redactText(hostile);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('redact', () => {
  it('masks sensitive keys at any depth and keeps the rest', () => {
    expect(
      redact({
        user: { id: 'u1', password: 'x', session: { accessToken: 't' } },
        headers: { authorization: 'Bearer x', 'x-request-id': 'r1' },
        list: [{ apiKey: 'k' }, 'contact me at a@example.com'],
      }),
    ).toEqual({
      user: { id: 'u1', password: REDACTED, session: { accessToken: REDACTED } },
      headers: { authorization: REDACTED, 'x-request-id': 'r1' },
      list: [{ apiKey: REDACTED }, `contact me at ${REDACTED_EMAIL}`],
    });
  });

  it('never mutates its input and keeps empty values readable', () => {
    const input = { password: 'x', token: null };
    expect(redact(input)).toEqual({ password: REDACTED, token: null });
    expect(input).toEqual({ password: 'x', token: null });
  });

  it('rebuilds errors with redacted messages, stacks, causes and fields', () => {
    const error = Object.assign(new Error('failed for a@example.com'), {
      details: { refreshToken: 'r' },
    });
    error.cause = new Error(`Bearer ${'z'.repeat(12)}`);
    const result = redact(error);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBe(error);
    expect(result.message).toBe(`failed for ${REDACTED_EMAIL}`);
    expect(result.stack).not.toContain('a@example.com');
    expect((result.cause as Error).message).toBe(`Bearer ${REDACTED}`);
    expect(result).toMatchObject({ details: { refreshToken: REDACTED } });
  });

  it('survives cycles, deep nesting and binary data', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(redact(cyclic)).toEqual({ name: 'loop', self: '[Circular]' });
    let deep: Record<string, unknown> = { leaf: true };
    for (let level = 0; level < 10; level += 1) deep = { deep };
    expect(JSON.stringify(redact(deep))).toContain('[Truncated]');
    expect(redact({ data: new Uint8Array([1, 2]) })).toEqual({ data: '[Binary]' });
    expect(redact({ when: new Date(0) }).when).toEqual(new Date(0));
  });
});

describe('isSensitiveKey', () => {
  it('recognizes credential-like names in any style', () => {
    for (const key of [
      'password',
      'PASSWD',
      'clientSecret',
      'refresh_token',
      'Authorization',
      'x-api-key',
      'otp',
      'pin',
      'dsn',
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    for (const key of ['id', 'email', 'userId', 'requestId', 'status', 'spinner']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe('redactUrl', () => {
  it('keeps scheme, host and path only', () => {
    expect(redactUrl('https://user:pw@api.example.com/v1/items?token=abc#frag')).toBe(
      'https://api.example.com/v1/items',
    );
    expect(redactUrl('/relative/path?secret=1')).toBe('/relative/path');
  });
});
