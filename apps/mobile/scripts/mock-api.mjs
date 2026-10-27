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
//   MOCK_APP_SCHEME=templateapp-dev
//                               scheme of the links it "emails" (the
//                               development build's; templateapp-e2e for e2e)
//
// Accounts: member@example.com / member-password, admin@example.com /
// admin-password; the member has 45 items, as `pnpm db:seed` gives the API.
// Simpler than the API where the app cannot tell: a refresh token works once,
// with no reuse window; no rate limits; a new password needs 15 to 200
// characters, without the API's other checks.
//
// No email leaves the mock: every message the API would send (a link to
// confirm a sign-up, reset a password, confirm or undo a change of email,
// accept an invitation, or a notice) is printed with its link and kept in an
// outbox. Open a link on the emulator with
//   adb shell am start -a android.intent.action.VIEW -d '<link>'
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
//   GET  /__mock/outbox             the messages "sent", oldest first:
//                                   [{ to, kind, link? }]
//   POST /__mock/outbox/clear       empties the outbox
//
// A fault with status 426 on any route shows the app's update screen, as the
// API does for a version below MOBILE_MIN_VERSION_*.
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
 * @typedef {'reset-password' | 'confirm-sign-up' | 'accept-invitation' | 'confirm-email-change' | 'revert-email-change'} LinkScreen
 * @typedef {{ to: string; kind: string; link?: string }} MockMail
 * @typedef {{ id: string; email: string; role: 'member' | 'admin'; invitedBy: { id: string; name: string } | null; createdAt: string; expiresAt: string }} MockInvitation
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
  'GET /api/auth/capabilities',
  'POST /api/auth/sign-ups',
  'POST /api/auth/sign-ups/confirm',
  'POST /api/auth/password-resets',
  'POST /api/auth/password-resets/confirm',
  'POST /api/account/password',
  'POST /api/account/email',
  'POST /api/account/deletion',
  'POST /api/auth/email-changes/confirm',
  'POST /api/auth/email-changes/revert',
  'GET /api/admin/invitations',
  'POST /api/admin/invitations',
  'DELETE /api/admin/invitations/{id}',
  'POST /api/auth/invitations/accept',
  'GET /api/users',
  'GET /api/users/{id}',
  'PUT /api/devices/{installationId}',
  'DELETE /api/devices/{installationId}',
]);

/** The ids `pnpm db:seed` gives the member's items: Item 1 is …0001. */
export const seedItemId = (/** @type {number} */ index) =>
  `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFRESH_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** How long each emailed link works, as the API's. */
const LINK_TTL_MS = {
  'reset-password': 30 * MINUTE,
  'confirm-sign-up': DAY,
  'accept-invitation': 7 * DAY,
  'confirm-email-change': DAY,
  'revert-email-change': 7 * DAY,
};

/**
 * A mock API server, not yet listening; its state lives as long as it does.
 * @param {{ accessTtlSec?: number; latencyMs?: number; appScheme?: string; log?: (line: string) => void }} [options]
 */
export function createMockApi({
  accessTtlSec = 900,
  latencyMs = 0,
  appScheme = 'templateapp-dev',
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
  /** @type {MockMail[]} what the API would have emailed, oldest first */
  const outbox = [];
  /**
   * @type {Map<string, { screen: LinkScreen; expiresAt: number; data: Record<string, any> }>}
   * link token → what it does (one use)
   */
  const linkTokens = new Map();
  /** @type {MockInvitation[]} */
  const invitations = [];
  /**
   * The devices registered for push, by installation id (the mock sends no notification).
   * @type {Map<string, { userId: string; pushToken: string; platform: string }>}
   */
  const devices = new Map();

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

  /**
   * "Emails" a message: kept in the outbox and printed, with its link.
   * @param {string} to
   * @param {string} kind
   * @param {{ screen: LinkScreen; data: Record<string, any> }} [link]
   */
  function mail(to, kind, link) {
    /** @type {MockMail} */
    const message = { to, kind };
    if (link) {
      const token = randomBytes(32).toString('base64url');
      linkTokens.set(token, { ...link, expiresAt: Date.now() + LINK_TTL_MS[link.screen] });
      message.link = `${appScheme}://${link.screen}#token=${token}`;
    }
    outbox.push(message);
    log(`Mail to ${to} (${kind})${message.link ? `: ${message.link}` : ''}`);
  }

  /**
   * The data of a live link token for `screen`; the handler deletes the token
   * once it did what it is for (a refused password leaves it usable).
   * @param {unknown} token
   * @param {LinkScreen} screen
   */
  function linkData(token, screen) {
    if (typeof token !== 'string') return undefined;
    const entry = linkTokens.get(token);
    if (!entry || entry.screen !== screen || entry.expiresAt <= Date.now()) return undefined;
    return entry.data;
  }

  /** Every token of the user stops working: signed out everywhere. */
  function endSessionsOf(/** @type {string} */ userId) {
    for (const [token, session] of accessTokens) {
      if (session.userId === userId) accessTokens.delete(token);
    }
    for (const [token, session] of refreshTokens) {
      if (session.userId === userId) refreshTokens.delete(token);
    }
  }

  /** As the API's policy, minus the lists: 15 to 200 characters (code points). */
  function passwordProblem(/** @type {unknown} */ password) {
    if (typeof password !== 'string' || password.length === 0) return 'Password is required';
    const length = Array.from(password.normalize('NFKC')).length;
    if (length < 15) return 'Use at least 15 characters.';
    if (length > 200) return 'Use at most 200 characters.';
    return undefined;
  }

  /** @param {unknown} value */
  const emailOf = (value) => {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return EMAIL.test(email) && email.length <= 254 ? email : undefined;
  };
  // The API refuses a NUL in typed text (apps/api/src/common/free-text.ts).
  const NUL = '\u0000';
  const NUL_REFUSED = 'Contains a character that is not allowed';
  /** @param {unknown} value */
  const nameOf = (value) => {
    const name = typeof value === 'string' ? value.trim() : '';
    return name.length >= 1 && name.length <= 100 && !name.includes(NUL) ? name : undefined;
  };
  const userByEmail = (/** @type {string} */ email) =>
    users.find((candidate) => candidate.email === email);

  /** @param {Omit<MockUser, 'id' | 'createdAt'>} fields */
  function createUser(fields) {
    /** @type {MockUser} */
    const user = { id: randomUUID(), createdAt: new Date().toISOString(), ...fields };
    users.push(user);
    return user;
  }

  /**
   * A page query (limit, offset), or an answer of 400 already sent.
   * @param {Context} context
   */
  function pageOf({ url, response }) {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    /** @type {FieldError[]} */
    const errors = [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push({ path: 'limit', message: 'Between 1 and 100' });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      errors.push({ path: 'offset', message: 'At least 0' });
    }
    if (errors.length > 0) {
      invalid(response, errors);
      return undefined;
    }
    return { limit, offset };
  }

  /**
   * The signed-in admin, or an answer of 401 or 403 already sent.
   * @param {Context} context
   */
  function signedInAdmin(context) {
    const user = signedIn(context);
    if (user && user.role !== 'admin') {
      fail(context.response, 403, 'Not allowed for this role');
      return undefined;
    }
    return user;
  }

  /** @param {Response} response */
  const noContent = (response, status = 204) => {
    response.writeHead(status);
    response.end();
  };

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
      if (query.includes(NUL)) errors.push({ path: 'q', message: NUL_REFUSED });
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
      if (title.includes(NUL)) errors.push({ path: 'title', message: NUL_REFUSED });
      if (description !== undefined && description.length > 2000) {
        errors.push({ path: 'description', message: 'At most 2000 characters' });
      }
      if (description?.includes(NUL)) errors.push({ path: 'description', message: NUL_REFUSED });
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

    'GET /api/auth/capabilities'({ response }) {
      // The mock "sends" email (the outbox): everything is offered.
      send(
        response,
        200,
        { passwordReset: true, signUp: true, emailChange: true, invitations: true },
        'Operation successful',
      );
    },

    async 'POST /api/auth/sign-ups'({ request, response }) {
      const body = fieldsOf(await readJson(request));
      const email = emailOf(body.email);
      const name = nameOf(body.name);
      /** @type {FieldError[]} */
      const errors = [];
      if (!email) errors.push({ path: 'email', message: 'Invalid email address' });
      if (!name) errors.push({ path: 'name', message: 'Between 1 and 100 characters' });
      const problem = passwordProblem(body.password);
      if (problem) errors.push({ path: 'password', message: problem });
      if (!email || !name || errors.length > 0) return invalid(response, errors);
      // The same answer either way: who has an account is never told.
      if (userByEmail(email)) mail(email, 'sign-up notice: the address has an account');
      else {
        mail(email, 'confirm your sign-up', {
          screen: 'confirm-sign-up',
          data: { email, name, password: body.password, attempts: 0 },
        });
      }
      noContent(response, 202);
    },

    async 'POST /api/auth/sign-ups/confirm'({ request, response }) {
      const { token, password } = fieldsOf(await readJson(request));
      if (typeof token !== 'string' || !LINK_TOKEN.test(token)) {
        return invalid(response, [{ path: 'token', message: 'Invalid token' }]);
      }
      const signUp = linkData(token, 'confirm-sign-up');
      if (!signUp) return fail(response, 404, 'This link is invalid, used or expired');
      if (password !== signUp.password) {
        // As the API: a few wrong passwords drop the sign-up.
        signUp.attempts += 1;
        if (signUp.attempts >= 5) linkTokens.delete(token);
        return fail(response, 401, 'Not the password chosen at sign-up');
      }
      linkTokens.delete(token);
      if (userByEmail(signUp.email)) {
        return fail(response, 409, 'An account with this address exists: sign in');
      }
      const user = createUser({
        email: signUp.email,
        name: signUp.name,
        role: 'member',
        password: signUp.password,
      });
      send(response, 200, startSession(user), 'Account created');
    },

    async 'POST /api/auth/password-resets'({ request, response }) {
      const email = emailOf(fieldsOf(await readJson(request)).email);
      if (!email) return invalid(response, [{ path: 'email', message: 'Invalid email address' }]);
      const user = userByEmail(email);
      if (user) {
        mail(email, 'reset your password', {
          screen: 'reset-password',
          data: { userId: user.id },
        });
      }
      noContent(response);
    },

    async 'POST /api/auth/password-resets/confirm'({ request, response }) {
      const { token, password } = fieldsOf(await readJson(request));
      /** @type {FieldError[]} */
      const errors = [];
      if (typeof token !== 'string' || !LINK_TOKEN.test(token)) {
        errors.push({ path: 'token', message: 'Invalid token' });
      }
      const problem = passwordProblem(password);
      if (problem) errors.push({ path: 'password', message: problem });
      if (errors.length > 0) return invalid(response, errors);
      const reset = linkData(token, 'reset-password');
      const user = reset && users.find((candidate) => candidate.id === reset.userId);
      if (!user) return fail(response, 404, 'This link is invalid, used or expired');
      linkTokens.delete(/** @type {string} */ (token));
      user.password = /** @type {string} */ (password);
      endSessionsOf(user.id);
      noContent(response);
    },

    async 'POST /api/account/password'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { request, response } = context;
      const { currentPassword, newPassword } = fieldsOf(await readJson(request));
      const problem = passwordProblem(newPassword);
      if (problem) return invalid(response, [{ path: 'newPassword', message: problem }]);
      if (currentPassword !== user.password) {
        return fail(response, 403, 'The current password is wrong');
      }
      user.password = /** @type {string} */ (newPassword);
      // Every session ends, this one included; this device gets a new one.
      endSessionsOf(user.id);
      send(response, 200, startSession(user), 'Password changed');
    },

    async 'POST /api/account/email'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { request, response } = context;
      const body = fieldsOf(await readJson(request));
      const newEmail = emailOf(body.newEmail);
      if (!newEmail) {
        return invalid(response, [{ path: 'newEmail', message: 'Invalid email address' }]);
      }
      if (newEmail === user.email) {
        return invalid(response, [
          { path: 'newEmail', message: 'This is already the address of the account' },
        ]);
      }
      if (body.currentPassword !== user.password) {
        return fail(response, 403, 'The current password is wrong');
      }
      if (userByEmail(newEmail))
        mail(newEmail, 'change of email notice: the address has an account');
      else {
        mail(newEmail, 'confirm your new address', {
          screen: 'confirm-email-change',
          data: { userId: user.id, from: user.email, to: newEmail },
        });
      }
      noContent(response, 202);
    },

    async 'POST /api/account/deletion'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { request, response } = context;
      const { password } = fieldsOf(await readJson(request));
      if (typeof password !== 'string' || password.length === 0) {
        return invalid(response, [{ path: 'password', message: 'Password is required' }]);
      }
      if (password !== user.password) return fail(response, 403, 'The password is wrong');
      if (user.role === 'admin' && users.filter(({ role }) => role === 'admin').length <= 1) {
        return fail(response, 409, 'The only administrator cannot delete their account');
      }
      endSessionsOf(user.id);
      users.splice(users.indexOf(user), 1);
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.ownerId === user.id) items.splice(index, 1);
      }
      for (const [installationId, device] of devices) {
        if (device.userId === user.id) devices.delete(installationId);
      }
      mail(user.email, 'your account was deleted');
      noContent(response);
    },

    async 'POST /api/auth/email-changes/confirm'({ request, response }) {
      const { token } = fieldsOf(await readJson(request));
      if (typeof token !== 'string' || !LINK_TOKEN.test(token)) {
        return invalid(response, [{ path: 'token', message: 'Invalid token' }]);
      }
      const change = linkData(token, 'confirm-email-change');
      const user = change && users.find((candidate) => candidate.id === change.userId);
      // Only while the account is as it was when the link was sent.
      if (!user || user.email !== change.from) {
        return fail(response, 404, 'This link is invalid, used or expired');
      }
      linkTokens.delete(token);
      if (userByEmail(change.to))
        return fail(response, 409, 'This address is used by another account');
      user.email = change.to;
      endSessionsOf(user.id);
      mail(change.from, 'your address changed: undo it', {
        screen: 'revert-email-change',
        data: { userId: user.id, previous: change.from },
      });
      noContent(response);
    },

    async 'POST /api/auth/email-changes/revert'({ request, response }) {
      const { token, password } = fieldsOf(await readJson(request));
      /** @type {FieldError[]} */
      const errors = [];
      if (typeof token !== 'string' || !LINK_TOKEN.test(token)) {
        errors.push({ path: 'token', message: 'Invalid token' });
      }
      const problem = passwordProblem(password);
      if (problem) errors.push({ path: 'password', message: problem });
      if (errors.length > 0) return invalid(response, errors);
      const revert = linkData(token, 'revert-email-change');
      const user = revert && users.find((candidate) => candidate.id === revert.userId);
      if (!user) return fail(response, 404, 'This link is invalid, used or expired');
      linkTokens.delete(/** @type {string} */ (token));
      const holder = userByEmail(revert.previous);
      if (holder && holder !== user) {
        return fail(response, 409, 'This address is used by another account');
      }
      user.email = revert.previous;
      user.password = /** @type {string} */ (password);
      endSessionsOf(user.id);
      noContent(response);
    },

    'GET /api/admin/invitations'(context) {
      if (!signedInAdmin(context)) return;
      const page = pageOf(context);
      if (!page) return;
      const pending = invitations
        .filter((invitation) => invitation.expiresAt > new Date().toISOString())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      send(
        context.response,
        200,
        { items: pending.slice(page.offset, page.offset + page.limit), total: pending.length },
        'Operation successful',
      );
    },

    async 'POST /api/admin/invitations'(context) {
      const admin = signedInAdmin(context);
      if (!admin) return;
      const { request, response } = context;
      const body = fieldsOf(await readJson(request));
      const email = emailOf(body.email);
      /** @type {FieldError[]} */
      const errors = [];
      if (!email) errors.push({ path: 'email', message: 'Invalid email address' });
      if (body.role !== 'member' && body.role !== 'admin') {
        errors.push({ path: 'role', message: 'member or admin' });
      }
      if (!email || errors.length > 0) return invalid(response, errors);
      if (userByEmail(email)) return fail(response, 409, 'An account with this address exists');
      // Inviting an address again replaces its invitation and its link.
      const previous = invitations.findIndex((invitation) => invitation.email === email);
      if (previous !== -1) invitations.splice(previous, 1);
      for (const [token, entry] of linkTokens) {
        if (entry.screen === 'accept-invitation' && entry.data.email === email) {
          linkTokens.delete(token);
        }
      }
      const now = Date.now();
      /** @type {MockInvitation} */
      const invitation = {
        id: randomUUID(),
        email,
        role: /** @type {'member' | 'admin'} */ (body.role),
        invitedBy: { id: admin.id, name: admin.name },
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + LINK_TTL_MS['accept-invitation']).toISOString(),
      };
      invitations.push(invitation);
      mail(email, 'you are invited', {
        screen: 'accept-invitation',
        data: { invitationId: invitation.id, email },
      });
      send(response, 201, invitation, 'Invitation sent');
    },

    'DELETE /api/admin/invitations/{id}'(context) {
      if (!signedInAdmin(context)) return;
      const id = context.params.id ?? '';
      if (!UUID.test(id)) {
        return fail(context.response, 400, 'Validation failed (uuid is expected)');
      }
      const index = invitations.findIndex((invitation) => invitation.id === id);
      if (index === -1) return fail(context.response, 404, 'Invitation not found');
      invitations.splice(index, 1);
      noContent(context.response);
    },

    async 'POST /api/auth/invitations/accept'({ request, response }) {
      const body = fieldsOf(await readJson(request));
      const name = nameOf(body.name);
      /** @type {FieldError[]} */
      const errors = [];
      if (typeof body.token !== 'string' || !LINK_TOKEN.test(body.token)) {
        errors.push({ path: 'token', message: 'Invalid token' });
      }
      if (!name) errors.push({ path: 'name', message: 'Between 1 and 100 characters' });
      const problem = passwordProblem(body.password);
      if (problem) errors.push({ path: 'password', message: problem });
      if (!name || errors.length > 0) return invalid(response, errors);
      const accepted = linkData(body.token, 'accept-invitation');
      const invitation =
        accepted && invitations.find((candidate) => candidate.id === accepted.invitationId);
      if (!invitation) return fail(response, 404, 'This invitation is invalid or expired');
      linkTokens.delete(/** @type {string} */ (body.token));
      invitations.splice(invitations.indexOf(invitation), 1);
      if (userByEmail(invitation.email)) {
        return fail(response, 409, 'An account with this address exists');
      }
      const user = createUser({
        email: invitation.email,
        name,
        role: invitation.role,
        password: /** @type {string} */ (body.password),
      });
      send(response, 200, startSession(user), 'Invitation accepted');
    },

    'GET /api/users'(context) {
      if (!signedInAdmin(context)) return;
      const page = pageOf(context);
      if (!page) return;
      const sorted = [...users].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
      send(
        context.response,
        200,
        {
          items: sorted.slice(page.offset, page.offset + page.limit).map(account),
          total: sorted.length,
        },
        'Operation successful',
      );
    },

    'GET /api/users/{id}'(context) {
      const user = signedIn(context);
      if (!user) return;
      const id = context.params.id ?? '';
      if (!UUID.test(id)) {
        return fail(context.response, 400, 'Validation failed (uuid is expected)');
      }
      // Members read only themselves; any other id answers 404.
      const found =
        user.role === 'admin' || id === user.id
          ? users.find((candidate) => candidate.id === id)
          : undefined;
      if (!found) return fail(context.response, 404, 'User not found');
      send(context.response, 200, account(found), 'Operation successful');
    },

    async 'PUT /api/devices/{installationId}'(context) {
      const user = signedIn(context);
      if (!user) return;
      const { request, response } = context;
      const installationId = context.params.installationId ?? '';
      if (!UUID.test(installationId)) {
        return fail(response, 400, 'Validation failed (uuid is expected)');
      }
      const body = fieldsOf(await readJson(request));
      /** @type {FieldError[]} */
      const errors = [];
      if (typeof body.pushToken !== 'string' || !EXPO_PUSH_TOKEN.test(body.pushToken)) {
        errors.push({ path: 'pushToken', message: 'Not an Expo push token' });
      }
      if (body.platform !== 'ios' && body.platform !== 'android') {
        errors.push({
          path: 'platform',
          message: 'Invalid option: expected one of "ios"|"android"',
        });
      }
      if (body.kind !== undefined && body.kind !== 'expo') {
        errors.push({ path: 'kind', message: 'Invalid input: expected "expo"' });
      }
      if (errors.length > 0) return invalid(response, errors);
      // The token belongs to this installation only; the installation to the caller.
      for (const [other, device] of devices) {
        if (device.pushToken === body.pushToken && other !== installationId) devices.delete(other);
      }
      devices.set(installationId, {
        userId: user.id,
        pushToken: /** @type {string} */ (body.pushToken),
        platform: /** @type {string} */ (body.platform),
      });
      noContent(response);
    },

    'DELETE /api/devices/{installationId}'(context) {
      const user = signedIn(context);
      if (!user) return;
      const installationId = context.params.installationId ?? '';
      if (!UUID.test(installationId)) {
        return fail(context.response, 400, 'Validation failed (uuid is expected)');
      }
      if (devices.get(installationId)?.userId !== user.id) {
        return fail(context.response, 404, 'Device not found');
      }
      devices.delete(installationId);
      noContent(context.response);
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
    if (route === 'GET /__mock/outbox') {
      send(response, 200, outbox, 'Outbox');
      return true;
    }
    if (route === 'POST /__mock/outbox/clear') {
      outbox.length = 0;
      send(response, 200, null, 'Outbox cleared');
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
  createMockApi({
    accessTtlSec,
    latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 0),
    ...(process.env.MOCK_APP_SCHEME && { appScheme: process.env.MOCK_APP_SCHEME }),
  }).listen(port, '127.0.0.1', () => {
    console.log(`Mock API on http://127.0.0.1:${port} (access tokens live ${accessTtlSec} s).`);
    console.log(
      `Android: adb reverse tcp:${port} tcp:${port} so the emulator reaches it as localhost.`,
    );
  });
}
