import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { checkPassword } from '../auth/password.js';
import type { PrismaClient } from '../prisma/generated/client.js';
import { SEED_ITEM_COUNT, SEED_USERS, seed, seedItemId } from './seed.js';

// The development data (`pnpm db:seed`): the accounts and items the app's
// end-to-end flows (apps/mobile/.maestro) start from.

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
    // Hourly from 2026-01-01, newest first.
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

  it('removes the items the member created since, and leaves other accounts alone', async () => {
    const member = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'member@example.com' },
    });
    const other = await t.prisma.user.create({
      data: { email: 'someone@example.test', name: 'Someone', passwordHash: 'not-a-hash' },
    });
    await t.prisma.item.create({ data: { ownerId: member.id, title: 'Created by Maestro' } });
    const kept = await t.prisma.item.create({ data: { ownerId: other.id, title: 'Their own' } });

    await seed(client());

    const memberItems = await t.prisma.item.findMany({ where: { ownerId: member.id } });
    expect(memberItems).toHaveLength(SEED_ITEM_COUNT);
    expect(memberItems.some((item) => item.title === 'Created by Maestro')).toBe(false);
    await expect(t.prisma.item.findUnique({ where: { id: kept.id } })).resolves.not.toBeNull();
    await expect(t.prisma.user.findUnique({ where: { id: other.id } })).resolves.not.toBeNull();
  });
});
