// The proxy the end-to-end flows run through (e2e-proxy.mjs): it passes
// requests and answers through unchanged, and fails only what a flow asks
// for. An HTTP server in this file stands in for the API. Run by
// `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createE2eProxy, parseArgs } from './e2e-proxy.mjs';

/**
 * @typedef {{ method: string; url: string; headers: import('node:http').IncomingHttpHeaders; body: string }} Seen
 */

/** @param {import('node:http').Server} server */
const baseOf = (server) => {
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null);
  return `http://127.0.0.1:${String(address.port)}`;
};

/** @param {import('node:http').Server} server */
async function listening(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return baseOf(server);
}

describe('e2e proxy', () => {
  /** @type {Seen[]} the requests the API received */
  const seen = [];
  let issued = 0;
  /** @type {Set<string>} the refresh tokens the API was asked to end */
  const loggedOut = new Set();
  let logoutStatus = 204;

  // The API's side: sign-in and refresh issue a new pair (a refresh token
  // "same-second" gets the last pair again, as the API's JWTs within one
  // second), logout ends one, anything else echoes what arrived.
  const api = createServer((request, response) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const url = request.url ?? '/';
      seen.push({ method: request.method ?? '', url, headers: request.headers, body });
      if (url === '/api/auth/sign-in' || url === '/api/auth/refresh') {
        if (!body.includes('same-second')) issued += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            data: {
              accessToken: `access-${String(issued)}`,
              refreshToken: `refresh-${String(issued)}`,
            },
            message: 'Signed in',
          }),
        );
        return;
      }
      if (url === '/api/auth/logout') {
        loggedOut.add(/** @type {{ refreshToken: string }} */ (JSON.parse(body)).refreshToken);
        response.writeHead(logoutStatus);
        response.end();
        return;
      }
      response.writeHead(201, { 'content-type': 'application/json', 'x-request-id': 'req-1' });
      response.end(JSON.stringify({ data: { echoed: body }, message: 'Created' }));
    });
  });

  /** @type {string[]} */
  const logged = [];
  /** @type {import('node:http').Server} */
  let proxy;
  let base = '';
  let apiBase = '';

  before(async () => {
    apiBase = await listening(api);
    proxy = createE2eProxy({ apiUrl: apiBase, log: (line) => logged.push(line) });
    base = await listening(proxy);
  });
  after(() => {
    proxy.closeAllConnections();
    proxy.close();
    api.closeAllConnections();
    api.close();
  });
  beforeEach(async () => {
    await fetch(`${base}/__e2e/faults/clear`, { method: 'POST' });
    seen.length = 0;
    logged.length = 0;
    logoutStatus = 204;
  });

  /** @param {string} path @param {RequestInit} [init] */
  const call = (path, init) => fetch(`${base}${path}`, init);
  /** @param {string} path @param {unknown} [body] */
  const control = (path, body) =>
    call(`/__e2e/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  const signIn = async () => {
    const answer = await call('/api/auth/sign-in', { method: 'POST', body: '{}' });
    return /** @type {{ data: { accessToken: string; refreshToken: string } }} */ (
      await answer.json()
    ).data;
  };
  /** @param {string} token */
  const authorizationSeenFor = async (token) => {
    seen.length = 0;
    await call('/api/items', { headers: { authorization: `Bearer ${token}` } });
    return seen[0]?.headers.authorization;
  };

  test('passes the method, path, query, headers and body to the API, and its answer back', async () => {
    const answer = await call('/api/items?limit=5', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer some-token',
        'idempotency-key': 'key-1',
      },
      body: '{"title":"A"}',
    });
    assert.equal(answer.status, 201);
    assert.equal(answer.headers.get('x-request-id'), 'req-1');
    assert.deepEqual(await answer.json(), {
      data: { echoed: '{"title":"A"}' },
      message: 'Created',
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.method, 'POST');
    assert.equal(seen[0]?.url, '/api/items?limit=5');
    assert.equal(seen[0]?.headers.authorization, 'Bearer some-token');
    assert.equal(seen[0]?.headers['idempotency-key'], 'key-1');
    assert.deepEqual(logged, ['POST /api/items 201']);
  });

  test('a fault answers that status in the API’s envelope, without reaching the API', async () => {
    const set = await control('faults', { route: 'GET /api/items', status: 500 });
    assert.equal(set.status, 200);
    const answer = await call('/api/items?search=Item');
    assert.equal(answer.status, 500);
    assert.deepEqual(await answer.json(), { data: null, message: 'Internal Server Error' });
    // Other routes still reach the API.
    assert.equal((await call('/api/users/me')).status, 201);
    assert.deepEqual(
      seen.map(({ url }) => url),
      ['/api/users/me'],
    );

    await control('faults/clear');
    assert.equal((await call('/api/items')).status, 201);
  });

  test('status 0 closes the connection without an answer', async () => {
    await control('faults', { route: 'POST /api/auth/sign-in', status: 0 });
    await assert.rejects(call('/api/auth/sign-in', { method: 'POST', body: '{}' }));
    assert.equal(seen.length, 0);
    assert.deepEqual(logged, ['POST /__e2e/faults 200', 'POST /api/auth/sign-in no answer']);
  });

  test('refuses a fault it cannot set, and an unknown control endpoint', async () => {
    for (const fault of [
      { route: 'GET /api/items', status: 200 },
      { route: 'GET /api/items', status: 600 },
      { route: 'items', status: 500 },
      { route: 'GET /api/items' },
    ]) {
      assert.equal((await control('faults', fault)).status, 400, JSON.stringify(fault));
    }
    assert.equal((await control('nothing')).status, 404);
    assert.equal(seen.length, 0);
  });

  test('expire: the access tokens issued so far reach the API replaced, newer ones unchanged', async () => {
    const before = await signIn();
    assert.equal(await authorizationSeenFor(before.accessToken), `Bearer ${before.accessToken}`);

    assert.equal((await control('sessions/expire')).status, 200);
    const replaced = await authorizationSeenFor(before.accessToken);
    assert.notEqual(replaced, `Bearer ${before.accessToken}`);
    assert.match(String(replaced), /^Bearer \S+$/);
    // A token presented to it before (never seen issued) expires too.
    assert.equal((await control('sessions/expire')).status, 200);

    const renewed = await signIn();
    assert.equal(await authorizationSeenFor(renewed.accessToken), `Bearer ${renewed.accessToken}`);
  });

  test('expire: a token the API issues again after the expiry works, identical as it may be', async () => {
    const first = await signIn();
    await control('sessions/expire');
    const answer = await call('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'same-second' }),
    });
    const again = /** @type {{ data: { accessToken: string } }} */ (await answer.json()).data;
    assert.equal(again.accessToken, first.accessToken);
    assert.equal(await authorizationSeenFor(again.accessToken), `Bearer ${again.accessToken}`);
  });

  test('revoke: the API ends every session seen, and their access tokens stop working', async () => {
    const first = await signIn();
    await call('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'old-refresh' }),
    });
    loggedOut.clear();

    assert.equal((await control('sessions/revoke')).status, 200);
    assert.ok(loggedOut.has(first.refreshToken));
    assert.ok(loggedOut.has('old-refresh'));
    assert.notEqual(await authorizationSeenFor(first.accessToken), `Bearer ${first.accessToken}`);
  });

  test('revoke fails when the API does not end a session', async () => {
    await signIn();
    logoutStatus = 500;
    const answer = await control('sessions/revoke');
    assert.equal(answer.status, 502);
  });

  test('passes /api/ routes only, always to the API’s host', async () => {
    /** A request with this exact target (fetch would normalize it). @param {string} target */
    const statusOf = (target) =>
      new Promise((resolve, reject) => {
        const { hostname, port } = new URL(base);
        request({ hostname, port, path: target }, (answer) => {
          answer.resume();
          resolve(answer.statusCode);
        })
          .on('error', reject)
          .end();
      });
    assert.equal(await statusOf('/health'), 404);
    assert.equal(await statusOf('http://example.invalid//example.invalid/api/items'), 404);
    assert.equal(seen.length, 0);

    // Whatever host a target names, what goes through goes to the API.
    for (const [target, path] of [
      ['//example.invalid/api/items', '/api/items'],
      ['http://example.invalid/api/items', '/api/items'],
      ['/api//example.invalid/items?x=1', '/api//example.invalid/items?x=1'],
    ]) {
      seen.length = 0;
      assert.equal(await statusOf(String(target)), 201, target);
      assert.equal(seen[0]?.url, path);
      assert.equal(seen[0]?.headers.host, new URL(apiBase).host);
    }
  });

  test('says so when the API does not answer', async () => {
    const down = createE2eProxy({ apiUrl: 'http://127.0.0.1:9', log: () => undefined });
    const downBase = await listening(down);
    try {
      const answer = await fetch(`${downBase}/api/items`);
      assert.equal(answer.status, 502);
      assert.match(
        /** @type {{ message: string }} */ (await answer.json()).message,
        /did not answer/,
      );
    } finally {
      down.close();
    }
  });
});

describe('e2e proxy command line', () => {
  const script = fileURLToPath(new URL('./e2e-proxy.mjs', import.meta.url));

  test('reads --log and the command after --', () => {
    assert.deepEqual(parseArgs(['--log', 'out.log', '--', 'maestro', 'test', '.maestro']), {
      logFile: 'out.log',
      command: ['maestro', 'test', '.maestro'],
    });
    assert.deepEqual(parseArgs([]), { command: [] });
    assert.throws(() => parseArgs(['--port', '1']), /Unknown option --port/);
    assert.throws(() => parseArgs(['--log']), /Unknown option --log/);
  });

  test('runs the command while the API answers, and exits with its status', async () => {
    // Asynchronous: the API below answers from this process's event loop.
    const api = createServer((_, response) => response.end('{}'));
    const apiUrl = await listening(api);
    try {
      const child = spawn(
        process.execPath,
        [script, '--', process.execPath, '-e', 'process.exit(3)'],
        {
          env: { ...process.env, E2E_API_URL: apiUrl, E2E_PROXY_PORT: '0' },
        },
      );
      let stdout = '';
      child.stdout.setEncoding('utf8').on('data', (/** @type {string} */ chunk) => {
        stdout += chunk;
      });
      const [status] = await once(child, 'close');
      assert.equal(status, 3);
      assert.match(stdout, /E2E proxy on http:\/\/127\.0\.0\.1:\d+, in front of/);
    } finally {
      api.close();
    }
  });

  test('stops before the command when the API does not answer', () => {
    const { status, stderr } = spawnSync(
      process.execPath,
      [script, '--', process.execPath, '-e', 'process.exit(0)'],
      {
        env: { ...process.env, E2E_API_URL: 'http://127.0.0.1:9', E2E_PROXY_PORT: '0' },
        encoding: 'utf8',
      },
    );
    assert.equal(status, 1);
    assert.match(stderr, /does not answer: start it with `pnpm dev`/);
  });
});
