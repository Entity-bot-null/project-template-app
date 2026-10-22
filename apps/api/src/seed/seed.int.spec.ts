import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { checkPassword } from '../auth/password.js';
import type { PrismaClient } from '../prisma/generated/client.js';
import { SEED_ITEM_COUNT, SEED_USERS, seed, seedItemId } from './seed.js';

// The development data (`pnpm db:seed`): the accounts and items the app's
// mock API serves too (apps/mobile/scripts/mock-api.mjs), so the app behaves
// the same against either.

describe('seed (integration)', () => {
  let t: TestApp;
  const client = () => t.prisma as unknown as PrismaClient;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('creates the accounts with their public passwords, and the member’s 45 items', async () => {
    await seed(client());
    for (const account of SEED_USERS) {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: account.email } });
      expect(user.role).toBe(account.role);
      await expect(checkPassword(user.passwordHash, account.password)).resolves.toBe(true);
    }
    const member = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'member@example.com' },
    });
    const items = await t.prisma.item.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(items).toHaveLength(SEED_ITEM_COUNT);
    expect(items.every((item) => item.ownerId === member.id)).toBe(true);
    // As the mock: hourly from 2026-01-01, newest first.
    expect(items[0]).toMatchObject({
      id: seedItemId(44),
      title: 'Item 45',
      description: 'Example item number 45.',
      createdAt: new Date(Date.UTC(2026, 0, 1) + 44 * 3_600_000),
    });
    expect(items.at(-1)?.title).toBe('Item 1');
  });

  it('runs again without duplicating anything, resetting what it owns', async () => {
    await t.prisma.item.update({ where: { id: seedItemId(0) }, data: { title: 'Edited' } });
    await seed(client());
    await expect(t.prisma.user.count()).resolves.toBe(SEED_USERS.length);
    await expect(t.prisma.item.count()).resolves.toBe(SEED_ITEM_COUNT);
    await expect(t.prisma.item.findUnique({ where: { id: seedItemId(0) } })).resolves.toMatchObject(
      { title: 'Item 1' },
    );
  });
});
