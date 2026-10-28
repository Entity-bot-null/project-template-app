// The end-to-end flows (.maestro/) run against the real API (apps/api,
// `pnpm dev`) through this proxy: it passes every request to the API as it
// came and hands back the API's answer, so the data, the rules and the errors
// the app meets are the API's own. It fails on demand only what a healthy API
// never fails when a flow asks it to: a status for a route, a connection that
// drops, an access token that stops working early, a session ended on the
// server (docs/adr/0013-real-api-only.md). The e2e build talks to it
// (EXPO_PUBLIC_API_URL=http://localhost:4010); the development build talks to
// the API directly.
//
//   node scripts/e2e-proxy.mjs [--log <file>] [-- <command> <args>…]
//
// With a command (`pnpm test:e2e`, `pnpm test:e2e:stack`), it checks that the
// API answers, runs the command and stops with it, exiting with its status;
// without one, it runs until Ctrl+C (try an error state by hand with curl).
// --log writes one line per request to that file instead of the terminal.
//
//   E2E_PROXY_PORT=4010                 port (127.0.0.1 only)
//   E2E_API_URL=http://127.0.0.1:3010   the API it passes requests to
//
// Control endpoints, for the flows (.maestro/scripts/e2e-proxy.js) and for
// curl -X POST; never sent to the API, not in the contract:
//
//   POST /__e2e/faults {"route":"POST /api/auth/sign-in","status":429}
//        every request to that route (method and path, no query string) gets
//        that status and the API's error envelope instead of reaching the
//        API, until the faults are cleared; status 0 closes the connection
//        without an answer (a dropped network). 426 on any route shows the
//        app's update screen, as the API does below MOBILE_MIN_VERSION_*.
//   POST /__e2e/faults/clear       every request reaches the API again
//   POST /__e2e/sessions/expire    the access tokens issued so far stop
//                                  working, as if they expired early: the API
//                                  refuses them (401) and the app renews its
//                                  session with the API
//   POST /__e2e/sessions/revoke    the API ends every session seen so far (a
//                                  logout of each refresh token) and their
//                                  access tokens stop working, as after a new
//                                  password: the API refuses the app's next
//                                  renewal and the app's session ends
//
// An access token "stops working" by reaching the API replaced with one that
// was never issued: the 401 and everything after it come from the API.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer, request as httpRequest, STATUS_CODES } from 'node:http';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {import('node:http').IncomingMessage} Request
 * @typedef {import('node:http').ServerResponse} Response
 * @typedef {import('node:http').IncomingHttpHeaders} Headers
 * @typedef {{ status: number; headers: Headers; body: Buffer }} Answer
 */

const BEARER = /^Bearer\s+(\S+)\s*$/i;
/** What an expired access token is replaced with: no API ever issued it. */
const EXPIRED_TOKEN = 'expired-by-the-e2e-proxy';
/** Connection-level headers, not passed on (RFC 9110, section 7.6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** @param {AsyncIterable<unknown>} stream */
async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(/** @type {Buffer} */ (chunk));
  return Buffer.concat(chunks);
}

/**
 * A JSON body as an object; undefined when it is not one.
 * @param {Buffer} body
 * @returns {Record<string, unknown> | undefined}
 */
function jsonObjectOf(body) {
  try {
    const value = /** @type {unknown} */ (JSON.parse(body.toString('utf8')));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Headers to pass on: without the connection-level ones and the length,
 * which the body that goes out sets again.
 * @param {Headers} headers
 */
function passedOn(headers) {
  /** @type {Headers} */
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(name) && name !== 'content-length' && value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

/**
 * Sends a request to the API and reads its whole answer.
 * @param {URL} url
 * @param {{ method: string; headers: Headers; body: Buffer }} init
 * @returns {Promise<Answer>}
 */
function forward(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      { method, headers: { ...headers, host: url.host, 'content-length': body.length } },
      (incoming) => {
        readAll(incoming).then(
          (answer) =>
            resolve({
              status: incoming.statusCode ?? 502,
              headers: incoming.headers,
              body: answer,
            }),
          reject,
        );
      },
    );
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

/**
 * A proxy in front of the API, not yet listening; what it has seen and the
 * faults set live as long as it does.
 * @param {{ apiUrl: string; log?: (line: string) => void }} options
 */
export function createE2eProxy({
  apiUrl,
  log = (line) => {
    console.log(line);
  },
}) {
  const api = new URL(apiUrl);
  /** @type {Map<string, number>} "METHOD /path" → status (0: no answer) */
  const faults = new Map();
  /** Every access token issued or presented while the proxy runs. */
  const accessTokens = new Set();
  /** Every refresh token issued or presented while the proxy runs. */
  const refreshTokens = new Set();
  /** The access tokens that stopped working (expire, revoke). */
  const expired = new Set();

  /**
   * @param {Response} response
   * @param {number} status
   * @param {unknown} data
   * @param {string} message
   */
  function send(response, status, data, message) {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ data, message }));
  }

  /**
   * The tokens of a session the API returned ({ data: { accessToken, refreshToken } }).
   * An access token the API issues after it expired here works again: a
   * renewal within the same second as the token it replaces gives the very
   * same token (its claims carry the time in whole seconds, no unique id).
   */
  function rememberSession(/** @type {Buffer} */ body) {
    const data = jsonObjectOf(body)?.data;
    if (typeof data !== 'object' || data === null) return;
    const { accessToken, refreshToken } = /** @type {Record<string, unknown>} */ (data);
    if (typeof accessToken === 'string') {
      accessTokens.add(accessToken);
      expired.delete(accessToken);
    }
    if (typeof refreshToken === 'string') refreshTokens.add(refreshToken);
  }

  /** Ends on the API every session the proxy has seen. */
  async function revokeSessions() {
    for (const refreshToken of refreshTokens) {
      const answer = await forward(new URL('/api/auth/logout', api), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ refreshToken })),
      });
      if (answer.status < 200 || answer.status >= 300) {
        throw new Error(`POST /api/auth/logout: HTTP ${String(answer.status)}`);
      }
    }
    for (const token of accessTokens) expired.add(token);
  }

  /**
   * The control endpoints (see the top of this file).
   * @param {string} route
   * @param {Request} request
   * @param {Response} response
   */
  async function control(route, request, response) {
    if (route === 'POST /__e2e/faults') {
      const body = jsonObjectOf(await readAll(request)) ?? {};
      const status = body.status;
      if (
        typeof body.route !== 'string' ||
        !/^[A-Z]+ \/\S*$/.test(body.route) ||
        typeof status !== 'number' ||
        !Number.isInteger(status) ||
        (status !== 0 && (status < 400 || status > 599))
      ) {
        return send(response, 400, null, 'Expected {"route":"METHOD /path","status":0 or 400-599}');
      }
      faults.set(body.route, status);
      return send(response, 200, { route: body.route, status }, 'Fault set');
    }
    if (route === 'POST /__e2e/faults/clear') {
      faults.clear();
      return send(response, 200, null, 'Faults cleared');
    }
    if (route === 'POST /__e2e/sessions/expire') {
      for (const token of accessTokens) expired.add(token);
      return send(response, 200, null, 'Access tokens expired');
    }
    if (route === 'POST /__e2e/sessions/revoke') {
      try {
        await revokeSessions();
      } catch (error) {
        return send(response, 502, null, `The API did not end the sessions (${String(error)})`);
      }
      return send(response, 200, null, 'Sessions revoked');
    }
    send(response, 404, null, `No control endpoint ${route}`);
  }

  /**
   * @param {Request} request
   * @param {Response} response
   */
  async function handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = `${request.method ?? 'GET'} ${url.pathname}`;
    if (url.pathname.startsWith('/__e2e/')) return control(route, request, response);

    const fault = faults.get(route);
    if (fault === 0) {
      response.destroy();
      return;
    }
    if (fault !== undefined) return send(response, fault, null, STATUS_CODES[fault] ?? 'Fault');

    const body = await readAll(request);
    const headers = passedOn(request.headers);
    const bearer = BEARER.exec(String(headers.authorization ?? ''))?.[1];
    if (bearer !== undefined) {
      accessTokens.add(bearer);
      if (expired.has(bearer)) headers.authorization = `Bearer ${EXPIRED_TOKEN}`;
    }
    const presented = jsonObjectOf(body)?.refreshToken;
    if (typeof presented === 'string') refreshTokens.add(presented);

    /** @type {Answer} */
    let answer;
    try {
      answer = await forward(new URL(url.pathname + url.search, api), {
        method: request.method ?? 'GET',
        headers,
        body,
      });
    } catch (error) {
      return send(
        response,
        502,
        null,
        `The API at ${api.origin} did not answer (${String(error)}): is \`pnpm dev\` running?`,
      );
    }
    rememberSession(answer.body);
    response.writeHead(answer.status, {
      ...passedOn(answer.headers),
      'content-length': answer.body.length,
    });
    response.end(answer.body);
  }

  return createServer((request, response) => {
    Promise.resolve(handle(request, response))
      .catch((/** @type {unknown} */ error) => {
        console.error(error);
        if (!response.headersSent) send(response, 500, null, 'E2E proxy error');
      })
      .finally(() => {
        const outcome = response.headersSent ? response.statusCode : 'no answer';
        log(
          `${request.method ?? 'GET'} ${new URL(request.url ?? '/', 'http://x').pathname} ${outcome}`,
        );
      });
  });
}

/**
 * Whether the API answers its liveness probe.
 * @param {string} apiUrl
 */
export async function apiAnswers(apiUrl) {
  try {
    const answer = await fetch(new URL('/api/health/live', apiUrl), {
      signal: AbortSignal.timeout(5_000),
    });
    return answer.ok;
  } catch {
    return false;
  }
}

/**
 * The options of the command line: --log <file>, then the command after --.
 * @param {string[]} args
 * @returns {{ logFile?: string; command: string[] }}
 */
export function parseArgs(args) {
  const separator = args.indexOf('--');
  const own = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  /** @type {string | undefined} */
  let logFile;
  for (let index = 0; index < own.length; index += 1) {
    const value = own[index + 1];
    if (own[index] === '--log' && value !== undefined && !value.startsWith('-')) {
      logFile = value;
      index += 1;
    } else {
      throw new Error(
        `Unknown option ${String(own[index])}: expected [--log <file>] [-- <command>]`,
      );
    }
  }
  return { ...(logFile !== undefined && { logFile }), command };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { logFile, command } = parseArgs(process.argv.slice(2));
  const port = Number(process.env.E2E_PROXY_PORT ?? 4010);
  const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3010';
  if (logFile !== undefined) mkdirSync(dirname(logFile), { recursive: true });
  const log =
    logFile === undefined
      ? undefined
      : (/** @type {string} */ line) => {
          appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
        };

  if (!(await apiAnswers(apiUrl))) {
    console.error(
      `The API at ${apiUrl} does not answer: start it with \`pnpm dev\` (and \`pnpm db:seed\` for the example accounts).`,
    );
    process.exit(1);
  }
  const proxy = createE2eProxy({ apiUrl, ...(log && { log }) });
  proxy.listen(port, '127.0.0.1', () => {
    const address = proxy.address();
    const listening = typeof address === 'object' && address !== null ? address.port : port;
    console.log(`E2E proxy on http://127.0.0.1:${String(listening)}, in front of ${apiUrl}.`);
    if (command.length === 0) {
      console.log(
        `Android: adb reverse tcp:${String(listening)} tcp:${String(listening)} so the device reaches it as localhost.`,
      );
      return;
    }
    const [program = '', ...rest] = command;
    const child = spawn(program, rest, { stdio: 'inherit' });
    child.on('error', (error) => {
      console.error(`Could not start ${program} (${error.message}).`);
      process.exitCode = 1;
      proxy.close();
    });
    // Ctrl+C reaches the command directly (same process group); its exit
    // stops the proxy.
    process.on('SIGINT', () => {
      // Nothing: the command got it too.
    });
    process.on('SIGTERM', () => child.kill('SIGTERM'));
    child.on('exit', (code, signal) => {
      process.exitCode = code ?? (signal ? 130 : 1);
      proxy.close();
      proxy.closeAllConnections();
    });
  });
}
