// `pnpm mock:api`: a local implementation of openapi/openapi.json, for
// development without a backend and for the end-to-end flows (.maestro/).
// In memory, reset on restart. Not a backend to deploy: no persistence,
// accounts with public passwords, plain HTTP on this machine only.
//
//   MOCK_API_PORT=4010          port (127.0.0.1 only)
//   MOCK_ACCESS_TTL_SEC=900     access token lifetime: lower it to watch the
//                               app renew its session
//   MOCK_LATENCY_MS=0           delay added to every answer (loading states)
//
// Accounts: member@example.com / member-password, admin@example.com / admin-password.
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
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, STATUS_CODES } from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);
const ACCESS_TTL_SEC = Number(process.env.MOCK_ACCESS_TTL_SEC ?? 900);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 0);

const users = [
  {
    id: 'user-member',
    email: 'member@example.com',
    name: 'Member',
    role: 'member',
    password: 'member-password',
  },
  {
    id: 'user-admin',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    password: 'admin-password',
  },
];

/** access token → { userId, expiresAt } */
const accessTokens = new Map();
/** refresh token → { userId, used } (rotated: each one works once) */
const refreshTokens = new Map();
/** "METHOD /path" → the status it answers with instead (0: no answer) */
const faults = new Map();

const items = Array.from({ length: 45 }, (_, index) => ({
  id: `item-${index + 1}`,
  title: `Item ${index + 1}`,
  description: `Example item number ${index + 1}.`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000).toISOString(),
}));

const publicUser = ({ password: _password, ...user }) => user;

function issueTokens(userId) {
  const accessToken = randomBytes(24).toString('hex');
  const refreshToken = randomBytes(32).toString('hex');
  accessTokens.set(accessToken, { userId, expiresAt: Date.now() + ACCESS_TTL_SEC * 1000 });
  refreshTokens.set(refreshToken, { userId, used: false });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC };
}

function send(response, status, data, message, extra = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ data, message, ...extra }));
}

const fail = (response, status, message, errors) =>
  send(response, status, null, message, errors ? { errors } : {});

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

function authenticatedUser(request) {
  const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
  const session = match ? accessTokens.get(match[1]) : undefined;
  if (!session || session.expiresAt <= Date.now()) return undefined;
  return users.find((user) => user.id === session.userId);
}

/** The control endpoints (see the top of this file); false for any other route. */
async function control(route, request, response) {
  if (route === 'POST /__mock/faults') {
    const body = await readJson(request);
    const status = body?.status;
    if (
      typeof body?.route !== 'string' ||
      !/^[A-Z]+ \/\S*$/.test(body.route) ||
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

async function handle(request, response) {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  const route = `${request.method} ${url.pathname}`;

  if (await control(route, request, response)) return;

  const fault = faults.get(route);
  if (fault === 0) {
    response.destroy();
    return;
  }
  if (fault !== undefined) return fail(response, fault, STATUS_CODES[fault] ?? 'Fault');

  if (route === 'POST /api/auth/sign-in') {
    const body = await readJson(request);
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      return fail(response, 400, 'Invalid body', [{ path: 'email', message: 'Required' }]);
    }
    const user = users.find((candidate) => candidate.email === body.email.trim().toLowerCase());
    if (!user || user.password !== body.password) {
      return fail(response, 401, 'Invalid email or password');
    }
    return send(response, 200, { ...issueTokens(user.id), user: publicUser(user) }, 'Signed in');
  }

  if (route === 'POST /api/auth/refresh') {
    const body = await readJson(request);
    const stored = refreshTokens.get(body?.refreshToken);
    if (!stored || stored.used) return fail(response, 401, 'Invalid refresh token');
    stored.used = true;
    return send(response, 200, issueTokens(stored.userId), 'Refreshed');
  }

  if (route === 'POST /api/auth/logout') {
    const body = await readJson(request);
    refreshTokens.delete(body?.refreshToken);
    return send(response, 200, null, 'Signed out');
  }

  const user = authenticatedUser(request);
  if (!user) return fail(response, 401, 'Missing or expired access token');

  if (route === 'GET /api/users/me') return send(response, 200, publicUser(user), 'OK');

  if (route === 'GET /api/items') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 50);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const matching = items
      .filter((item) => item.title.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return send(
      response,
      200,
      { items: matching.slice(offset, offset + limit), total: matching.length },
      'OK',
    );
  }

  if (route === 'POST /api/items') {
    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 120) {
      return fail(response, 400, 'Invalid body', [
        { path: 'title', message: 'Between 1 and 120 characters' },
      ]);
    }
    const item = {
      id: `item-${randomUUID().slice(0, 8)}`,
      title,
      ...(typeof body.description === 'string' &&
        body.description.trim() && { description: body.description.trim() }),
      createdAt: new Date().toISOString(),
    };
    items.push(item);
    return send(response, 201, item, 'Created');
  }

  const itemMatch = /^GET \/api\/items\/([\w-]{1,64})$/.exec(route);
  if (itemMatch) {
    const item = items.find((candidate) => candidate.id === itemMatch[1]);
    return item ? send(response, 200, item, 'OK') : fail(response, 404, 'Item not found');
  }

  return fail(response, 404, `No route ${route}`);
}

createServer((request, response) => {
  const requestId = request.headers['x-request-id'] ?? randomUUID();
  response.setHeader('X-Request-Id', String(requestId));
  setTimeout(() => {
    handle(request, response)
      .catch((error) => {
        console.error(error);
        fail(response, 500, 'Mock API error');
      })
      .finally(() => {
        const outcome = response.headersSent ? response.statusCode : 'no answer';
        console.log(
          `${request.method} ${new URL(request.url ?? '/', 'http://x').pathname} ${outcome}`,
        );
      });
  }, LATENCY_MS);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mock API on http://127.0.0.1:${PORT} (access tokens live ${ACCESS_TTL_SEC} s).`);
  console.log(
    `Android: adb reverse tcp:${PORT} tcp:${PORT} so the emulator reaches it as localhost.`,
  );
});
