// The mock API stays true to the contract (docs/adr/0002-pnpm-monorepo.md, D8):
// this suite fails when the mock serves a route or a method the contract does
// not have, answers a status the contract does not declare for the route, or
// sends a body that does not match the contract's schema for that answer.
// Run by `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { createMockApi, ROUTES, seedItemId } from './mock-api.mjs';

/**
 * @typedef {Record<string, any>} Schema
 * @typedef {{ responses: Record<string, { content?: { 'application/json'?: { schema: Schema } } }> }} Operation
 */

/** @type {{ paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } }} */
const contract = JSON.parse(
  readFileSync(new URL('../../../openapi/openapi.json', import.meta.url), 'utf8'),
);

// The contract's patterns, written out here rather than compiled from the
// file: a pattern the checker does not know fails the check (add it here).
const PATTERNS = new Map([['^[A-Za-z0-9_-]{43}$', /^[A-Za-z0-9_-]{43}$/]]);

const FORMATS = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
};

/**
 * Where `value` breaks `schema` (the OpenAPI 3.0 subset the contract uses),
 * as a list of "path: problem"; empty when it matches.
 * @param {unknown} value
 * @param {Schema} schema
 * @param {string} [path]
 * @returns {string[]}
 */
function violations(value, schema, path = '$') {
  if (typeof schema.$ref === 'string') {
    const target = contract.components.schemas[schema.$ref.split('/').at(-1) ?? ''];
    if (target === undefined) return [`${path}: unknown ${schema.$ref}`];
    return violations(value, target, path);
  }
  if (value === null) return schema.nullable === true ? [] : [`${path}: null`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`];
  }
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return [`${path}: not an object`];
      const record = /** @type {Record<string, unknown>} */ (value);
      const properties = /** @type {Record<string, Schema>} */ (schema.properties ?? {});
      const problems = [];
      for (const name of schema.required ?? []) {
        if (!(name in record)) problems.push(`${path}.${name}: missing`);
      }
      for (const [name, child] of Object.entries(record)) {
        const property = properties[name];
        if (property !== undefined)
          problems.push(...violations(child, property, `${path}.${name}`));
        else if (schema.additionalProperties === false)
          problems.push(`${path}.${name}: not allowed`);
      }
      return problems;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${path}: not an array`];
      return value.flatMap((child, index) => violations(child, schema.items, `${path}[${index}]`));
    case 'string': {
      if (typeof value !== 'string') return [`${path}: not a string`];
      const format = FORMATS[/** @type {keyof typeof FORMATS} */ (schema.format)];
      if (format !== undefined && !format.test(value)) return [`${path}: not a ${schema.format}`];
      if (schema.pattern !== undefined) {
        const pattern = PATTERNS.get(schema.pattern);
        if (pattern === undefined) return [`${path}: the checker does not know ${schema.pattern}`];
        if (!pattern.test(value)) return [`${path}: does not match ${schema.pattern}`];
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return [`${path}: shorter than ${schema.minLength}`];
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return [`${path}: longer than ${schema.maxLength}`];
      }
      return [];
    }
    case 'integer':
    case 'number':
      if (typeof value !== 'number' || (schema.type === 'integer' && !Number.isInteger(value))) {
        return [`${path}: not an ${schema.type}`];
      }
      if (schema.minimum !== undefined && value < schema.minimum) return [`${path}: below minimum`];
      return [];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: not a boolean`];
    default:
      return [];
  }
}

/** The contract's operation for a route of the mock ("GET /api/items/{id}"). */
function operationOf(/** @type {string} */ route) {
  const [method, path] = route.split(' ');
  return contract.paths[path ?? '']?.[(method ?? '').toLowerCase()];
}

describe('the schema checker', () => {
  test('bites: a wrong type, a missing or extra field, a format, a pattern, an enum', () => {
    const item = { $ref: '#/components/schemas/Item' };
    const valid = { id: seedItemId(0), title: 'x', createdAt: '2026-01-01T00:00:00.000Z' };
    assert.deepEqual(violations(valid, item), []);
    assert.notDeepEqual(violations({ ...valid, title: 1 }, item), []);
    assert.notDeepEqual(violations({ id: valid.id, title: 'x' }, item), []);
    assert.notDeepEqual(violations({ ...valid, extra: true }, item), []);
    assert.notDeepEqual(violations({ ...valid, id: 'item-1' }, item), []);
    assert.notDeepEqual(violations({ ...valid, createdAt: 'yesterday' }, item), []);
    const user = { $ref: '#/components/schemas/SessionUser' };
    assert.notDeepEqual(
      violations({ id: valid.id, email: 'a@b.c', name: 'A', role: 'owner' }, user),
      [],
    );
    assert.notDeepEqual(violations(null, item), []);
    const token = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' };
    assert.deepEqual(violations('A'.repeat(43), token), []);
    assert.notDeepEqual(violations('A'.repeat(42), token), []);
    assert.notDeepEqual(violations('x', { type: 'string', pattern: '^x$' }), []);
  });
});

describe('the mock API (scripts/mock-api.mjs) against openapi/openapi.json', () => {
  /** @type {import('node:http').Server} */
  let server;
  let base = '';

  before(async () => {
    server = createMockApi({ log: () => undefined });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(undefined);
      });
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  after(() => {
    server.close();
  });

  /**
   * Sends a request to a route of the mock and checks the answer against the
   * contract: a declared status, and a body that matches its schema.
   * @param {string} route  the contract's route, "POST /api/items/{id}"
   * @param {{ path?: string; body?: unknown; token?: string; headers?: Record<string, string> }} [request]
   */
  async function call(route, { path, body, token, headers = {} } = {}) {
    const [method, template] = route.split(' ');
    const response = await fetch(`${base}${path ?? template}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token !== undefined && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const declared = operationOf(route)?.responses[String(response.status)];
    assert.ok(
      declared,
      `${route} answered ${response.status}, which the contract does not declare`,
    );
    const schema = declared.content?.['application/json']?.schema;
    if (schema === undefined) {
      assert.equal(
        text,
        '',
        `${route} ${response.status} has a body the contract does not declare`,
      );
      return { status: response.status, body: undefined };
    }
    const json = JSON.parse(text);
    assert.deepEqual(violations(json, schema), [], `${route} ${response.status}: ${text}`);
    return { status: response.status, body: json };
  }

  const signIn = async (email = 'member@example.com', password = 'member-password') =>
    (await call('POST /api/auth/sign-in', { body: { email, password } })).body.data;

  test('serves only routes and methods the contract has', () => {
    for (const route of ROUTES) assert.ok(operationOf(route), `${route} is not in the contract`);
  });

  test('sessions: sign-in, renewal and logout, with their refusals', async () => {
    assert.equal((await call('POST /api/auth/sign-in', { body: {} })).status, 400);
    assert.equal(
      (
        await call('POST /api/auth/sign-in', {
          body: { email: 'member@example.com', password: 'no' },
        })
      ).status,
      401,
    );
    const session = await signIn();
    const renewed = await call('POST /api/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    assert.equal(renewed.status, 200);
    // Each refresh token works once.
    assert.equal(
      (await call('POST /api/auth/refresh', { body: { refreshToken: session.refreshToken } }))
        .status,
      401,
    );
    assert.equal(
      (await call('POST /api/auth/refresh', { body: { refreshToken: 'x' } })).status,
      400,
    );
    const loggedOut = await call('POST /api/auth/logout', {
      body: { refreshToken: renewed.body.data.refreshToken },
    });
    assert.equal(loggedOut.status, 204);
    assert.equal((await call('POST /api/auth/logout', { body: {} })).status, 400);
  });

  test('the account', async () => {
    const { accessToken } = await signIn();
    assert.equal((await call('GET /api/users/me', { token: accessToken })).status, 200);
    assert.equal((await call('GET /api/users/me')).status, 401);
    assert.equal((await call('GET /api/users/me', { token: 'expired' })).status, 401);
  });

  test('items: pages, search, one item, and only the owner’s', async () => {
    const { accessToken } = await signIn();
    const page = await call('GET /api/items', {
      path: '/api/items?limit=20&offset=0',
      token: accessToken,
    });
    assert.equal(page.status, 200);
    assert.equal(page.body.data.total, 45);
    assert.equal(page.body.data.items[0].title, 'Item 45');
    const found = await call('GET /api/items', {
      path: '/api/items?q=item%207',
      token: accessToken,
    });
    assert.deepEqual(
      found.body.data.items.map((/** @type {{ title: string }} */ item) => item.title),
      ['Item 7'],
    );
    assert.equal(
      (await call('GET /api/items', { path: '/api/items?limit=101', token: accessToken })).status,
      400,
    );
    assert.equal((await call('GET /api/items')).status, 401);

    const one = await call('GET /api/items/{id}', {
      path: `/api/items/${seedItemId(6)}`,
      token: accessToken,
    });
    assert.equal(one.body.data.description, 'Example item number 7.');
    assert.equal(
      (await call('GET /api/items/{id}', { path: '/api/items/item-7', token: accessToken })).status,
      400,
    );
    assert.equal(
      (
        await call('GET /api/items/{id}', {
          path: `/api/items/${seedItemId(99)}`,
          token: accessToken,
        })
      ).status,
      404,
    );
    // The admin owns none of them.
    const admin = await signIn('admin@example.com', 'admin-password');
    assert.equal((await call('GET /api/items', { token: admin.accessToken })).body.data.total, 0);
    assert.equal(
      (
        await call('GET /api/items/{id}', {
          path: `/api/items/${seedItemId(6)}`,
          token: admin.accessToken,
        })
      ).status,
      404,
    );
  });

  test('creating items, with and without an Idempotency-Key', async () => {
    const { accessToken } = await signIn();
    const created = await call('POST /api/items', {
      token: accessToken,
      body: { title: '  Buy milk ', description: ' ' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.title, 'Buy milk');
    assert.equal('description' in created.body.data, false);
    const invalid = await call('POST /api/items', { token: accessToken, body: { title: '' } });
    assert.deepEqual(invalid.body.errors, [{ path: 'title', message: 'Title is required' }]);

    const key = { 'Idempotency-Key': '00000000-0000-4000-8000-000000000001' };
    const first = await call('POST /api/items', {
      token: accessToken,
      headers: key,
      body: { title: 'Once' },
    });
    const again = await call('POST /api/items', {
      token: accessToken,
      headers: key,
      body: { title: 'Once' },
    });
    assert.deepEqual(again.body.data, first.body.data);
    const reused = await call('POST /api/items', {
      token: accessToken,
      headers: key,
      body: { title: 'Other' },
    });
    assert.equal(reused.status, 422);
    assert.equal((await call('POST /api/items', { body: { title: 'x' } })).status, 401);
  });

  test('a fault set on demand answers with the error envelope', async () => {
    await fetch(`${base}/__mock/faults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: 'GET /api/items', status: 429 }),
    });
    const { accessToken } = await signIn();
    assert.equal((await call('GET /api/items', { token: accessToken })).status, 429);
    await fetch(`${base}/__mock/faults/clear`, { method: 'POST' });
    assert.equal((await call('GET /api/items', { token: accessToken })).status, 200);
  });
});
