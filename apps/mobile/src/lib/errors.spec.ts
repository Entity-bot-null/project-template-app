import {
  AppError,
  isAppError,
  isExpected,
  isRetryable,
  kindForStatus,
  toAppError,
  userMessage,
} from './errors';

describe('kindForStatus', () => {
  it.each([
    [400, 'validation'],
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [422, 'validation'],
    [429, 'rateLimited'],
    [500, 'server'],
    [503, 'server'],
    [418, 'unknown'],
  ] as const)('maps %i to %s', (status, kind) => {
    expect(kindForStatus(status)).toBe(kind);
  });
});

describe('toAppError', () => {
  it('keeps an AppError as it is', () => {
    const error = new AppError('timeout', 'slow');
    expect(toAppError(error)).toBe(error);
  });

  it("recognizes React Native's network failure and aborts", () => {
    expect(toAppError(new TypeError('Network request failed')).kind).toBe('network');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(toAppError(abort).kind).toBe('cancelled');
  });

  it('treats anything else as unknown, keeping the cause', () => {
    const bug = new RangeError('index out of range');
    const error = toAppError(bug);
    expect(error.kind).toBe('unknown');
    expect(error.cause).toBe(bug);
    expect(toAppError('a string').kind).toBe('unknown');
    expect(isAppError(error)).toBe(true);
    expect(isAppError(bug)).toBe(false);
  });
});

describe('retries and reporting', () => {
  it('retries only what may succeed later', () => {
    expect(isRetryable(new AppError('network', ''))).toBe(true);
    expect(isRetryable(new AppError('timeout', ''))).toBe(true);
    expect(isRetryable(new AppError('rateLimited', ''))).toBe(true);
    expect(isRetryable(new AppError('server', '', { status: 503 }))).toBe(true);
    expect(isRetryable(new AppError('server', '', { status: 501 }))).toBe(false);
    expect(isRetryable(new AppError('validation', ''))).toBe(false);
    expect(isRetryable(new AppError('unauthenticated', ''))).toBe(false);
  });

  it('reports bugs and server failures, not normal outcomes', () => {
    expect(isExpected(new AppError('network', ''))).toBe(true);
    expect(isExpected(new AppError('validation', ''))).toBe(true);
    expect(isExpected(new AppError('server', ''))).toBe(false);
    expect(isExpected(new AppError('unknown', ''))).toBe(false);
  });
});

describe('userMessage', () => {
  it('never shows the technical message', () => {
    const message = userMessage(
      new AppError('server', 'SQLSTATE 23505 duplicate key on users_email_key'),
    );
    expect(message).toBe('Something went wrong on our side. Try again later.');
    expect(userMessage(new Error('TypeError: undefined is not a function'))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('tells the user what to do for each kind', () => {
    expect(userMessage(new AppError('network', ''))).toMatch(/offline/);
    expect(userMessage(new AppError('unauthenticated', ''))).toMatch(/Sign in again/);
    expect(userMessage(new AppError('rateLimited', ''))).toMatch(/Wait a moment/);
  });
});
