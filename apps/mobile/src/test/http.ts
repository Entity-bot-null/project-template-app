// HTTP stub for tests: replaces global fetch with a router answering API
// envelopes. A request no route expects fails the test, so a test never
// passes because of a call it did not mean to make.

export type Handler = (request: Request) => Response | Promise<Response>;

export interface StubbedFetch {
  /** Every request received, in order. */
  requests: Request[];
  /** Replaces or adds routes mid-test. */
  on(route: string, handler: Handler): void;
  restore(): void;
}

/**
 * The handler's answer, settled as fetch settles it: once the request's
 * signal aborts (a query cancelled because its screen unmounted, the app's
 * own timeout), the request rejects with the abort reason, even while its
 * answer is held (deferred). Otherwise a held answer never released would
 * leave the request pending, and the app's timeout timer with it, after the
 * test.
 */
function answer(request: Request, handler: Handler): Promise<Response> {
  const { signal } = request;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => handler(request))
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
  });
}

/** What fetch rejects with on an abort: the signal's reason, an AbortError unless one was given. */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('This operation was aborted', 'AbortError');
}

/** Routes are "METHOD /path" (no query string; `:param` matches one segment). */
export function stubFetch(routes: Record<string, Handler>): StubbedFetch {
  const table = new Map(Object.entries(routes));
  const requests: Request[] = [];
  const original = globalThis.fetch;

  function match(request: Request): Handler | undefined {
    const path = new URL(request.url).pathname;
    for (const [route, handler] of table) {
      const [method = '', pattern = ''] = route.split(' ');
      if (method !== request.method) continue;
      const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`);
      if (regex.test(path)) return handler;
    }
    return undefined;
  }

  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    const handler = match(request);
    if (handler === undefined) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }
    return answer(request, handler);
  }) as typeof fetch;

  return {
    requests,
    on: (route, handler) => {
      table.set(route, handler);
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A success envelope. */
export function ok(data: unknown, status = 200): Response {
  return json(status, { data, message: 'OK' });
}

/** An answer without a body (204), as the API gives to a logout. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** A 202 without a body, as the API answers a request whose link goes by email (a sign-up). */
export function accepted(): Response {
  return new Response(null, { status: 202 });
}

/** An error envelope. */
export function failure(
  status: number,
  message: string,
  errors?: { path: string; message: string }[],
): Response {
  return json(status, { data: null, message, ...(errors && { errors }) });
}

/** A response held until released: loading states and races. */
export function deferred(): { promise: Promise<Response>; resolve(response: Response): void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export async function bodyOf(request: Request): Promise<unknown> {
  return JSON.parse(await request.clone().text()) as unknown;
}
