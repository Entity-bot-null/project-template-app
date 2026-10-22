// `pnpm mock:api`: a local implementation of openapi/openapi.json, for
// development without a backend and for the end-to-end flows (.maestro/).
// In memory, reset on restart. Not a backend to deploy: no persistence,
// accounts with public passwords, plain HTTP on this machine only. The real
// API is apps/api (`pnpm dev`); this mock answers what the contract says for
// the routes in ROUTES, and scripts/mock-api.test.mjs fails when it serves a
// route, a status or a body the contract does not declare.
//
//   MOCK_API_PORT=4010          port (127.0.0.1 only)
//   MOCK_ACCESS_TTL_SEC=900     access token lifetime: lower it to watch the
//                               app renew its session
//   MOCK_LATENCY_MS=0           delay added to every answer (loading states)
//
// Accounts: member@example.com / member-password, admin@example.com /
// admin-password; the member has 45 items, as `pnpm db:seed` gives the API.
// Simpler than the API where the app cannot tell: a refresh token works once,
// with no reuse window; no rate limits.
//
// Failures on demand, for the end-to-end flows (.maestro/scripts/mock-api.js)
// and for trying an error state by hand (curl -X POST …). Not in the contract:
//
//   POST /__mock/faults {"route":"POST /api/auth/sign-in","status":429}
//        every request to that route (method and path, no query string) gets
//        that status and an error envelope, until the faults are cleared;
//        status 0 closes the connection without an answer (a dropped network)
//   POST /__mock/faults/clear       every route answers normally again
//   POST /__mock/sessions/expire    every access token stops working, as if it
//                                   expired early: the app renews its session
//   POST /__mock/sessions/revoke    every access and refresh token stops
//                                   working (signed out everywhere, password
//                                   changed): the app's session ends
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, STATUS_CODES } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {import('node:http').IncomingMessage} Request
 * @typedef {import('node:http').ServerResponse} Response
 * @typedef {{ id: string; email: string; name: string; role: 'member' | 'admin'; createdAt: string; password: string }} MockUser
 * @typedef {{ id: string; ownerId: string; title: string; description?: string; createdAt: string }} MockItem
 * @typedef {{ path: string; message: string }} FieldError
 * @typedef {{ request: Request; response: Response; url: URL; params: Record<string, string> }} Context
 */

/** The API routes the mock serves, as the contract names them. */
export const ROUTES = Object.freeze([
  'POST /api/auth/sign-in',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/users/me',
  'GET /api/items',
  'POST /api/items',
  'GET /api/items/{id}',
]);

/** The ids `pnpm db:seed` gives the member's items: Item 1 is …0001. */
export const seedItemId = (/** @type {number} */ index) =>
  `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFRESH_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A mock API server, not yet listening; its state lives as long as it does.
 * @param {{ accessTtlSec?: number; latencyMs?: number; log?: (line: string) => void }} [options]
 */
export function createMockApi({
  accessTtlSec = 900,
  latencyMs = 0,
  log = (line) => {
    console.log(line);
  },
} = {}) {
  /** @type {MockUser[]} */
  const users = [
    {
      id: '00000000-0000-7000-8000-0000000000a1',
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
      createdAt: '2026-01-01T00:00:00.000Z',
      password: 'member-password',
    },
    {
      id: '00000000-0000-7000-8000-0000000000a2',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      password: 'admin-password',
    },
  ];
  const member = /** @type {MockUser} */ (users[0]);

  /** @type {Map<string, { userId: string; expiresAt: number }>} access token → session */
  const accessTokens = new Map();
  /** @type {Map<string, { userId: string }>} refresh token → session (each works once) */
  const refreshTokens = new Map();
  /** @type {Map<string, number>} "METHOD /path" → the status it answers with instead (0: no answer) */
  const faults = new Map();
  /** @type {Map<string, { itemId: string; requestHash: string }>} "userId key" → its create */
  const idempotencyKeys = new Map();

  /** @type {MockItem[]} */
  const items = Array.from({ length: 45 }, (_, index) => ({
    id: seedItemId(index),
    ownerId: member.id,
    title: `Item ${index + 1}`,
    description: `Example item number ${index + 1}.`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000).toISOString(),
  }));

  /** @param {MockUser} user */
  const sessionUser = ({ id, email, name, role }) => ({ id, email, name, role });
  /** @param {MockUser} user */
  const account = ({ password: _password, ...user }) => user;
  /** @param {MockItem} item */
  const itemOf = ({ ownerId: _ownerId, ...item }) => item;

  /** @param {MockUser} user */
  function startSession(user) {
    const accessToken = randomBytes(24).toString('hex');
    const refreshToken = randomBytes(32).toString('base64url');
    accessTokens.set(accessToken, { userId: user.id, expiresAt: Date.now() + accessTtlSec * 1000 });
    refreshTokens.set(refreshToken, { userId: user.id });
    return { accessToken, refreshToken, expiresIn: accessTtlSec, user: sessionUser(user) };
  }

  /**
   * @param {Response} response
   * @param {number} status
   * @param {unknown} data
   * @param {string} message
   * @param {Record<string, unknown>} [extra]
   */
  function send(response, status, data, message, extra = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data, message, ...extra }));
  }

  /**
   * @param {Response} response
   * @param {number} status
   * @param {string} message
   */
  const fail = (response, status, message) => send(response, status, null, message);

  /** The API's 400: every invalid field, and a message joining them. */
  const invalid = (/** @type {Response} */ response, /** @type {FieldError[]} */ errors) =>
    send(response, 400, null, errors.map(({ path, message }) => `${path}: ${message}`).join(', '), {
      errors,
    });

  /** @param {Request} request */
  async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(/** @type {Buffer} */ (chunk));
    if (chunks.length === 0) return {};
    try {
      return /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      return undefined;
    }
  }

  /** @param {unknown} body */
  const fieldsOf = (body) =>
    /** @type {Record<string, unknown>} */ (typeof body === 'object' && body !== null ? body : {});

  /**
   * The signed-in user, or an answer of 401 already sent.
   * @param {Context} context
   */
  function signedIn({ request, response }) {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) {
      fail(response, 401, 'Missing access token');
      return undefined;
    }
    const session = accessTokens.get(match[1] ?? '');
    const user =
      session && session.expiresAt > Date.now()
        ? users.find((candidate) => candidate.id === session.userId)
        : undefined;
    if (!user) fail(response, 401, 'Invalid or expired access token');
    return user;
  }

  /** @type {Record<string, (context: Context) => Promise<void> | void>} */
  const handlers = {
    async 'POST /api/auth/sign-in'({ request, response }) {
      const body = fieldsOf(await readJson(request));
      const email = typeof body.email === 'string' ? body.email.trim() : undefined;
      /** @type {FieldError[]} */
      const errors = [];
      if (email === undefined || !EMAIL.test(email) || email.length > 254) {
        errors.push({ path: 'email', message: 'Invalid email address' });
      }
      if (typeof body.password !== 'string' || body.password.length === 0) {
        errors.push({ path: 'password', message: 'Password is required' });
      }
      if (errors.length > 0) return invalid(response, errors);
      const user = users.find((candidate) => candidate.email === email?.toLowerCase());
      if (!user || user.password !== body.password) {
        return fail(response, 401, 'Invalid email or password');
      }
      send(response, 200, startSession(user), 'Signed in');
    },

    async 'POST /api/auth/refresh'({ request, response }) {
      const { refreshToken } = fieldsOf(await readJson(request));
      if (typeof refreshToken !== 'string' || !REFRESH_TOKEN.test(refreshToken)) {
        return invalid(response, [{ path: 'refreshToken', message: 'Invalid refresh token' }]);
      }
      const stored = refreshTokens.get(refreshToken);
      const user = stored && users.find((candidate) => candidate.id === stored.userId);
      if (!user) return fail(response, 401, 'Invalid or expired session');
      refreshTokens.delete(refreshToken);
      send(response, 200, startSession(user), 'Session renewed');
    },

    async 'POST /api/auth/logout'({ request, response }) {
      const { refreshToken } = fieldsOf(await readJson(request));
      if (typeof refreshToken !== 'string' || !REFRESH_TOKEN.test(refreshToken)) {
        return invalid(response, [{ path: 'refreshToken', message: 'Invalid refresh token' }]);
      }
      refreshTokens.delete(refreshToken);
      response.writeHead(204);
      response.end();
    },

    'GET /api/users/me'(context) {
      const user = signedIn(context);
      if (user) send(context.response, 200, account(user), 'Operation successful');
    },

    'GET /api/items'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { url, response } = context;
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const query = (url.searchParams.get('q') ?? '').trim();
      /** @type {FieldError[]} */
      const errors = [];
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        errors.push({ path: 'limit', message: 'Between 1 and 100' });
      }
      if (!Number.isInteger(offset) || offset < 0) {
        errors.push({ path: 'offset', message: 'At least 0' });
      }
      if (query.length > 100) errors.push({ path: 'q', message: 'At most 100 characters' });
      if (errors.length > 0) return invalid(response, errors);
      const matching = items
        .filter((item) => item.ownerId === user.id)
        .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      send(
        response,
        200,
        { items: matching.slice(offset, offset + limit).map(itemOf), total: matching.length },
        'Operation successful',
      );
    },

    async 'POST /api/items'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { request, response } = context;
      const body = fieldsOf(await readJson(request));
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description =
        typeof body.description === 'string' ? body.description.trim() : undefined;
      const key = request.headers['idempotency-key'];
      /** @type {FieldError[]} */
      const errors = [];
      if (title.length === 0) errors.push({ path: 'title', message: 'Title is required' });
      if (title.length > 120) errors.push({ path: 'title', message: 'At most 120 characters' });
      if (description !== undefined && description.length > 2000) {
        errors.push({ path: 'description', message: 'At most 2000 characters' });
      }
      if (key !== undefined && (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key))) {
        errors.push({
          path: 'Idempotency-Key',
          message: 'Between 1 and 255 visible ASCII characters',
        });
      }
      if (errors.length > 0) return invalid(response, errors);

      // As the API: a retry with the key gets the first item back.
      const requestHash = createHash('sha256')
        .update(JSON.stringify([title, description || null]))
        .digest('hex');
      const keyOf = typeof key === 'string' ? `${user.id} ${key}` : undefined;
      const earlier = keyOf === undefined ? undefined : idempotencyKeys.get(keyOf);
      if (earlier && earlier.requestHash !== requestHash) {
        return fail(
          response,
          422,
          'This Idempotency-Key was used for a different request: use a new key',
        );
      }
      const replayed = earlier && items.find((item) => item.id === earlier.itemId);
      if (replayed) return send(response, 201, itemOf(replayed), 'Item created');

      /** @type {MockItem} */
      const item = {
        id: randomUUID(),
        ownerId: user.id,
        title,
        ...(description && { description }),
        createdAt: new Date().toISOString(),
      };
      items.push(item);
      if (keyOf !== undefined) idempotencyKeys.set(keyOf, { itemId: item.id, requestHash });
      send(response, 201, itemOf(item), 'Item created');
    },

    'GET /api/items/{id}'(context) {
      const user = signedIn(context);
      if (!user) return;
      const id = context.params.id ?? '';
      if (!UUID.test(id))
        return fail(context.response, 400, 'Validation failed (uuid is expected)');
      const item = items.find((candidate) => candidate.id === id && candidate.ownerId === user.id);
      if (!item) return fail(context.response, 404, 'Item not found');
      send(context.response, 200, itemOf(item), 'Operation successful');
    },
  };

  if (JSON.stringify(Object.keys(handlers)) !== JSON.stringify(ROUTES)) {
    throw new Error('mock-api.mjs: ROUTES and the handlers differ');
  }
  // Matched segment by segment: "{name}" takes any one segment.
  const routes = ROUTES.map((route) => {
    const [method, path] = route.split(' ');
    return { method, segments: (path ?? '').split('/'), handle: handlers[route] };
  });

  /**
   * The path parameters of `pathname` for a route's segments; undefined when
   * the path is not this route's.
   * @param {string[]} segments
   * @param {string} pathname
   */
  function paramsOf(segments, pathname) {
    const parts = pathname.split('/');
    if (parts.length !== segments.length) return undefined;
    /** @type {Record<string, string>} */
    const params = {};
    for (const [index, segment] of segments.entries()) {
      const part = parts[index] ?? '';
      if (segment.startsWith('{') && segment.endsWith('}')) {
        if (part === '') return undefined;
        params[segment.slice(1, -1)] = decodeURIComponent(part);
      } else if (segment !== part) {
        return undefined;
      }
    }
    return params;
  }

  /**
   * The control endpoints (see the top of this file); false for any other route.
   * @param {string} route
   * @param {Request} request
   * @param {Response} response
   */
  async function control(route, request, response) {
    if (route === 'POST /__mock/faults') {
      const body = fieldsOf(await readJson(request));
      const status = body.status;
      if (
        typeof body.route !== 'string' ||
        !/^[A-Z]+ \/\S*$/.test(body.route) ||
        typeof status !== 'number' ||
        !Number.isInteger(status) ||
        (status !== 0 && (status < 400 || status > 599))
      ) {
        fail(response, 400, 'Expected {"route":"METHOD /path","status":0 or 400-599}');
        return true;
      }
      faults.set(body.route, status);
      send(response, 200, { route: body.route, status }, 'Fault set');
      return true;
    }
    if (route === 'POST /__mock/faults/clear') {
      faults.clear();
      send(response, 200, null, 'Faults cleared');
      return true;
    }
    if (route === 'POST /__mock/sessions/expire') {
      accessTokens.clear();
      send(response, 200, null, 'Access tokens expired');
      return true;
    }
    if (route === 'POST /__mock/sessions/revoke') {
      accessTokens.clear();
      refreshTokens.clear();
      send(response, 200, null, 'Sessions revoked');
      return true;
    }
    return false;
  }

  /**
   * @param {Request} request
   * @param {Response} response
   */
  async function handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = `${request.method} ${url.pathname}`;

    if (await control(route, request, response)) return;

    const fault = faults.get(route);
    if (fault === 0) {
      response.destroy();
      return;
    }
    if (fault !== undefined) return fail(response, fault, STATUS_CODES[fault] ?? 'Fault');

    for (const candidate of routes) {
      if (candidate.method !== request.method || !candidate.handle) continue;
      const params = paramsOf(candidate.segments, url.pathname);
      if (params) return candidate.handle({ request, response, url, params });
    }
    fail(response, 404, `No route ${route}`);
  }

  return createServer((request, response) => {
    const requestId = request.headers['x-request-id'] ?? randomUUID();
    response.setHeader('X-Request-Id', String(requestId));
    // As the API: answers carry tokens and personal data, never cached.
    response.setHeader('Cache-Control', 'no-store');
    setTimeout(() => {
      Promise.resolve(handle(request, response))
        .catch((/** @type {unknown} */ error) => {
          console.error(error);
          fail(response, 500, 'Mock API error');
        })
        .finally(() => {
          const outcome = response.headersSent ? response.statusCode : 'no answer';
          log(`${request.method} ${new URL(request.url ?? '/', 'http://x').pathname} ${outcome}`);
        });
    }, latencyMs);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.MOCK_API_PORT ?? 4010);
  const accessTtlSec = Number(process.env.MOCK_ACCESS_TTL_SEC ?? 900);
  createMockApi({ accessTtlSec, latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 0) }).listen(
    port,
    '127.0.0.1',
    () => {
      console.log(`Mock API on http://127.0.0.1:${port} (access tokens live ${accessTtlSec} s).`);
      console.log(
        `Android: adb reverse tcp:${port} tcp:${port} so the emulator reaches it as localhost.`,
      );
    },
  );
}
