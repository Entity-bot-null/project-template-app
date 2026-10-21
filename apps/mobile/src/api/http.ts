import { AppError } from '@/lib/errors';
import { addBreadcrumb } from '@/lib/observability/errorReporter';

// The fetch every API call goes through (docs/MOBILE_ARCHITECTURE.md#networking):
//   - a timeout per request, and the caller's cancellation (TanStack Query
//     aborts queries nobody needs anymore);
//   - an X-Request-Id, so a failure reported by a user can be found in the
//     server's logs;
//   - the session's access token, and after a 401 exactly one replay with a
//     renewed token (no loops, one refresh shared by concurrent requests);
//   - failures turned into AppError (network, timeout, cancelled) and left
//     as breadcrumbs, with the path only: no query string, no body.
// HTTP error statuses are not thrown here: unwrap() reads them with the body.

export const REQUEST_ID_HEADER = 'X-Request-Id';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface AuthHandlers {
  /** The access token for the next request (renewed first if about to expire), or null. */
  getAccessToken(): Promise<string | null>;
  /**
   * Called after a 401 for `rejected`: the renewed token, or null when the
   * session has ended. Rejects with an AppError when renewing failed for a
   * transient reason (offline): the session may still be valid.
   */
  refreshAfterRejection(rejected: string): Promise<string | null>;
}

export interface HttpOptions {
  timeoutMs?: number;
  /** Absent for public endpoints: no token, no refresh. */
  auth?: AuthHandlers;
  /** Defaults to the global fetch, looked up per call so tests can stub it. */
  fetch?: (request: Request) => Promise<Response>;
}

export type HttpFetch = (request: Request) => Promise<Response>;

export function createHttp(options: HttpOptions = {}): HttpFetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetch ?? ((request: Request) => globalThis.fetch(request));

  async function send(request: Request, token: string | null): Promise<Response> {
    if (request.signal.aborted) throw new AppError('cancelled', 'Request cancelled before sending');

    const headers = new Headers(request.headers);
    headers.set('Accept', 'application/json');
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, newRequestId());
    if (token !== null) headers.set('Authorization', `Bearer ${token}`);
    const requestId = headers.get(REQUEST_ID_HEADER) ?? undefined;

    const controller = new AbortController();
    // Read after an await: an object, so the compiler does not narrow it.
    const outcome = { timedOut: false };
    const timer = setTimeout(() => {
      outcome.timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => {
      controller.abort();
    };
    request.signal.addEventListener('abort', forwardAbort);

    try {
      const response = await doFetch(new Request(request, { headers, signal: controller.signal }));
      if (response.status >= 500)
        breadcrumb(request, 'error', { status: response.status, requestId });
      return response;
    } catch (error) {
      if (outcome.timedOut) {
        breadcrumb(request, 'error', { status: 'timeout', requestId });
        throw new AppError('timeout', `No answer within ${timeoutMs} ms`, {
          requestId,
          cause: error,
        });
      }
      if (isAborted(request.signal)) {
        throw new AppError('cancelled', 'Request cancelled', { requestId, cause: error });
      }
      breadcrumb(request, 'warning', { status: 'network', requestId });
      throw new AppError('network', error instanceof Error ? error.message : 'Network failure', {
        requestId,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', forwardAbort);
    }
  }

  return async function http(request) {
    const auth = options.auth;
    if (auth === undefined) return send(request, null);

    // The body can be read once: keep a copy in case the request is replayed.
    const replay = request.clone();
    const token = await auth.getAccessToken();
    const response = await send(request, token);
    if (response.status !== 401 || token === null) return response;

    const renewed = await auth.refreshAfterRejection(token);
    if (renewed === null || renewed === token) return response;
    return send(replay, renewed);
  };
}

function breadcrumb(
  request: Request,
  level: 'warning' | 'error',
  data: { status: number | string; requestId: string | undefined },
): void {
  addBreadcrumb({
    category: 'network',
    level,
    message: `${request.method} ${pathOf(request.url)}`,
    data: { status: data.status, requestId: data.requestId ?? null },
  });
}

/** The path of a URL: no origin, no query string, no fragment. */
export function pathOf(url: string): string {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').split(/[?#]/, 1)[0] ?? '';
  return path === '' ? '/' : path;
}

/** The signal's state now (it changes while a request is in flight). */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** 128 random bits as hex: unique enough to find one request in the logs. */
function newRequestId(): string {
  let id = '';
  for (let index = 0; index < 4; index += 1) {
    id += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  }
  return id;
}
