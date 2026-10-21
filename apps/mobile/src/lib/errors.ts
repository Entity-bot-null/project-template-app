// One error type for the whole app (docs/mobile-architecture.md#errors):
//
//   technical error (fetch, HTTP status, parsing, a bug)
//     → AppError with a kind        toAppError(), errorFromResponse()
//     → message for the user        userMessage()
//     → log or report, redacted     src/lib/observability (unexpected kinds only)
//
// The technical message stays in logs and reports; users never see it.

export type AppErrorKind =
  | 'network' // no connection, DNS, TLS: the request never got an answer
  | 'timeout'
  | 'cancelled' // aborted by the app (unmounted screen, superseded query)
  | 'unauthenticated' // 401: missing, expired or revoked session
  | 'forbidden' // 403
  | 'notFound' // 404
  | 'validation' // 400 / 422: the input is wrong, field errors may say where
  | 'conflict' // 409
  | 'rateLimited' // 429
  | 'server' // 5xx, or a response that breaks the contract
  | 'unknown'; // anything else, usually a bug

export interface FieldError {
  path: string;
  message: string;
}

export interface AppErrorDetails {
  status?: number;
  /** The X-Request-Id of the request, to find it in the server's logs. */
  requestId?: string;
  fieldErrors?: FieldError[];
  /** The API's own message: written for client developers, not for users. */
  serverMessage?: string;
  cause?: unknown;
}

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly kind: AppErrorKind,
    message: string,
    readonly details: AppErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

const STATUS_KINDS: Record<number, AppErrorKind> = {
  400: 'validation',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  422: 'validation',
  429: 'rateLimited',
};

export function kindForStatus(status: number): AppErrorKind {
  return STATUS_KINDS[status] ?? (status >= 500 ? 'server' : 'unknown');
}

/** Normalizes anything thrown into an AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new AppError('cancelled', 'Request cancelled', { cause: error });
    }
    // React Native's fetch rejects with this TypeError when there is no
    // answer at all (offline, DNS, refused, TLS).
    if (error.name === 'TypeError' && /network request failed/i.test(error.message)) {
      return new AppError('network', error.message, { cause: error });
    }
    return new AppError('unknown', error.message, { cause: error });
  }
  return new AppError('unknown', String(error), { cause: error });
}

/** Failures worth retrying automatically: the same request may succeed later. */
export function isRetryable(error: AppError): boolean {
  return (
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    error.kind === 'rateLimited' ||
    (error.kind === 'server' && error.details.status !== 501)
  );
}

/** Failures that are expected in normal use: not reported as bugs. */
export function isExpected(error: AppError): boolean {
  return (
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    error.kind === 'cancelled' ||
    error.kind === 'unauthenticated' ||
    error.kind === 'forbidden' ||
    error.kind === 'notFound' ||
    error.kind === 'validation' ||
    error.kind === 'conflict' ||
    error.kind === 'rateLimited'
  );
}

const USER_MESSAGES: Record<AppErrorKind, string> = {
  network: 'You seem to be offline. Check your connection and try again.',
  timeout: 'The server is taking too long to answer. Try again in a moment.',
  cancelled: 'The request was cancelled.',
  unauthenticated: 'Your session has ended. Sign in again.',
  forbidden: 'You do not have access to this.',
  notFound: 'This item no longer exists.',
  validation: 'Some fields need your attention.',
  conflict: 'This was changed elsewhere. Refresh and try again.',
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  server: 'Something went wrong on our side. Try again later.',
  unknown: 'Something went wrong. Try again.',
};

/** The message a user sees for an error: never the technical one. */
export function userMessage(error: unknown): string {
  return USER_MESSAGES[toAppError(error).kind];
}
