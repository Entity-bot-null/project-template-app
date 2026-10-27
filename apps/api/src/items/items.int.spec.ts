import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectRecordAccess } from '../../test/access.js';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { asUser, seedUser } from '../../test/auth.js';
import { envelopeOf } from '../../test/http.js';
import { NUL_REFUSED } from '../common/free-text.js';
import { disabledErrorTracker, setErrorTracker } from '../observability/error-tracker.js';
import type { ItemResponse } from './dto/item.schemas.js';

interface ItemPage {
  items: ItemResponse[];
  total: number;
}

// The example resource against PostgreSQL: every route reads or writes only
// the caller's items (docs/authorization.md); a create with an
// Idempotency-Key is single, whatever retries arrive (the unique key).

describe('Items (integration)', () => {
  let t: TestApp;
  let ada: { id: string };
  let grace: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await seedUser(t.prisma, { email: 'ada@example.com' });
    grace = await seedUser(t.prisma, { email: 'grace@example.com' });
  });

  const asAda = () => asUser(t.app, ada.id);
  const asGrace = () => asUser(t.app, grace.id);
  const create = (body: object, headers: Record<string, string> = {}) =>
    request(t.server).post('/api/items').set(asAda()).set(headers).send(body);
  const list = (query = '') => request(t.server).get(`/api/items${query}`).set(asAda()).expect(200);

  it('creates an item, trimmed, without a description when it has none', async () => {
    const res = await create({ title: '  Buy milk ', description: '   ' }).expect(201);
    expect(res.body).toMatchObject({ data: { title: 'Buy milk' }, message: 'Item created' });
    const item = envelopeOf<ItemResponse>(res).data;
    expect(item).not.toHaveProperty('description');
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(t.prisma.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
      ownerId: ada.id,
      description: null,
      idempotencyKey: null,
    });
  });

  it('names every invalid field', async () => {
    const res = await create({ title: '', description: 'x'.repeat(2001) }).expect(400);
    expect(res.body).toMatchObject({
      data: null,
      errors: [
        { path: 'title', message: 'Title is required' },
        { path: 'description', message: 'At most 2000 characters' },
      ],
    });
  });

  it('refuses a NUL in free text with a 400 naming the field, never a database failure', async () => {
    // PostgreSQL text cannot hold U+0000: past the schema it was a 500,
    // reported to the error tracker as a database failure.
    const capture = vi.fn();
    setErrorTracker({ ...disabledErrorTracker, capture });
    try {
      const created = await create({ title: 'a\u0000b', description: 'c\u0000' }).expect(400);
      expect(created.body).toMatchObject({
        errors: [
          { path: 'title', message: NUL_REFUSED },
          { path: 'description', message: NUL_REFUSED },
        ],
      });
      const searched = await request(t.server)
        .get(`/api/items?q=${encodeURIComponent('a\u0000')}`)
        .set(asAda())
        .expect(400);
      expect(searched.body).toMatchObject({ errors: [{ path: 'q', message: NUL_REFUSED }] });
      expect(capture).not.toHaveBeenCalled();
      await expect(t.prisma.item.count()).resolves.toBe(0);
    } finally {
      setErrorTracker(disabledErrorTracker);
    }
  });

  it("lists only the caller's items, newest first, by pages that never overlap", async () => {
    const base = Date.UTC(2026, 0, 1);
    await t.prisma.item.createMany({
      data: [
        ...Array.from({ length: 5 }, (_, i) => ({
          ownerId: ada.id,
          title: `Item ${String(i + 1)}`,
          createdAt: new Date(base + i * 60_000),
        })),
        // Two at the same instant: the id decides, so a page boundary is stable.
        { ownerId: ada.id, title: 'Twin A', createdAt: new Date(base + 10 * 60_000) },
        { ownerId: ada.id, title: 'Twin B', createdAt: new Date(base + 10 * 60_000) },
        { ownerId: grace.id, title: 'Item of Grace', createdAt: new Date(base + 99 * 60_000) },
      ],
    });
    const first = envelopeOf<ItemPage>(await list('?limit=3')).data;
    const rest = envelopeOf<ItemPage>(await list('?limit=10&offset=3')).data;
    expect(first.total).toBe(7);
    const titles = [...first.items, ...rest.items].map((item) => item.title);
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(titles.slice(2)).toEqual(['Item 5', 'Item 4', 'Item 3', 'Item 2', 'Item 1']);
    expect(titles).not.toContain('Item of Grace');
  });

  it('searches titles whatever the case, literally (no wildcards)', async () => {
    await t.prisma.item.createMany({
      data: [
        { ownerId: ada.id, title: 'Buy MILK' },
        { ownerId: ada.id, title: 'Milkshake' },
        { ownerId: ada.id, title: 'Bread' },
        { ownerId: ada.id, title: '100% juice' },
        { ownerId: grace.id, title: 'Milk for Grace' },
      ],
    });
    const milk = envelopeOf<ItemPage>(await list('?q=milk')).data;
    expect(milk.items.map((item) => item.title).sort()).toEqual(['Buy MILK', 'Milkshake']);
    expect(milk.total).toBe(2);
    // % and _ are characters to find, not patterns.
    const percent = envelopeOf<ItemPage>(await list(`?q=${encodeURIComponent('%')}`)).data;
    expect(percent.items.map((item) => item.title)).toEqual(['100% juice']);
    const underscore = envelopeOf<ItemPage>(await list('?q=_')).data;
    expect(underscore.total).toBe(0);
  });

  it('validates the page and the search', async () => {
    for (const query of ['?limit=0', '?limit=101', '?offset=-1', `?q=${'x'.repeat(101)}`]) {
      await request(t.server).get(`/api/items${query}`).set(asAda()).expect(400);
    }
  });

  it("reads one item through its owner only: another user's answers 404, like a missing one", async () => {
    const { id } = await t.prisma.item.create({ data: { ownerId: ada.id, title: 'Mine' } });
    await expectRecordAccess(t.server, {
      path: (itemId) => `/api/items/${itemId}`,
      id,
      owner: asAda(),
      other: asGrace(),
    });
    await request(t.server).get('/api/items/not-a-uuid').set(asAda()).expect(400);
  });

  describe('with an Idempotency-Key', () => {
    const KEY = { 'Idempotency-Key': '00000000-0000-4000-8000-000000000001' };

    it('answers a retry with the first item, 201 again, and stores one', async () => {
      const first = envelopeOf<ItemResponse>(await create({ title: 'Once' }, KEY).expect(201)).data;
      const retried = envelopeOf<ItemResponse>(
        await create({ title: 'Once' }, KEY).expect(201),
      ).data;
      expect(retried).toEqual(first);
      await expect(t.prisma.item.count()).resolves.toBe(1);
    });

    it('stores one item for simultaneous retries', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => create({ title: 'Once' }, KEY)),
      );
      // Each one either got the item or was told the first is still running.
      for (const res of results) expect([201, 409]).toContain(res.status);
      const ids = new Set(
        results
          .filter((res) => res.status === 201)
          .map((res) => envelopeOf<ItemResponse>(res).data.id),
      );
      expect(ids.size).toBe(1);
      await expect(t.prisma.item.count()).resolves.toBe(1);
    });

    it('refuses the key with another body (422), and keeps keys apart per user', async () => {
      await create({ title: 'Once' }, KEY).expect(201);
      const reused = await create({ title: 'Something else' }, KEY).expect(422);
      expect(reused.body).toEqual({
        data: null,
        message: 'This Idempotency-Key was used for a different request: use a new key',
      });
      // Another user's key space is its own.
      await request(t.server)
        .post('/api/items')
        .set(asGrace())
        .set(KEY)
        .send({ title: 'Something else' })
        .expect(201);
      await expect(t.prisma.item.count()).resolves.toBe(2);
    });

    it('validates the key', async () => {
      const res = await create({ title: 'x' }, { 'Idempotency-Key': 'with spaces' }).expect(400);
      expect(res.body).toMatchObject({ errors: [{ path: 'Idempotency-Key' }] });
      await create({ title: 'x' }, { 'Idempotency-Key': 'k'.repeat(256) }).expect(400);
    });
  });

  it('needs a session on every route', async () => {
    await request(t.server).get('/api/items').expect(401);
    await request(t.server).post('/api/items').send({ title: 'x' }).expect(401);
    await request(t.server).get('/api/items/0190b6a1-0000-7000-8000-000000000001').expect(401);
  });
});
