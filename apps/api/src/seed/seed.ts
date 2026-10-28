import { normalizeEmail } from '../auth/auth.constants.js';
import { hashPassword } from '../auth/password.js';
import type { Role } from '../common/types/request-user.js';
import type { PrismaClient } from '../prisma/generated/client.js';

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

// Development, test and E2E accounts. The passwords are public on purpose:
// these accounts must never exist in production, and run.ts refuses to run
// with NODE_ENV=production.
export const SEED_USERS: readonly SeedUser[] = [
  { email: 'admin@example.com', name: 'Admin', role: 'admin', password: 'admin-password' },
  { email: 'member@example.com', name: 'Member', role: 'member', password: 'member-password' },
];

/** The member's example items: the fixtures of the app's end-to-end flows (apps/mobile/.maestro). */
export const SEED_ITEM_COUNT = 45;
const SEED_ITEMS_OWNER = 'member@example.com';

/** A fixed id per example item (a valid UUID), so a re-run finds it again. */
export function seedItemId(index: number): string {
  return `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
}

/**
 * Idempotent: users keyed on the email, a re-run resets name, role and
 * password; items keyed on their fixed ids, a re-run resets them and removes
 * the ones the member created since, so the app's end-to-end flows start from
 * the same list every time. Other accounts and their data stay.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  const ids = new Map<string, string>();
  for (const user of SEED_USERS) {
    const email = normalizeEmail(user.email);
    const passwordHash = await hashPassword(user.password);
    const { id } = await prisma.user.upsert({
      where: { email },
      create: { email, name: user.name, role: user.role, passwordHash },
      update: { name: user.name, role: user.role, passwordHash },
      select: { id: true },
    });
    ids.set(email, id);
  }
  const ownerId = ids.get(SEED_ITEMS_OWNER);
  if (ownerId === undefined) throw new Error(`The seed has no ${SEED_ITEMS_OWNER}`);
  for (let index = 0; index < SEED_ITEM_COUNT; index += 1) {
    // Hourly from 2026-01-01: Item 45 is the newest.
    const item = {
      ownerId,
      title: `Item ${String(index + 1)}`,
      description: `Example item number ${String(index + 1)}.`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000),
    };
    await prisma.item.upsert({
      where: { id: seedItemId(index) },
      create: { id: seedItemId(index), ...item },
      update: item,
    });
  }
  const seedIds = Array.from({ length: SEED_ITEM_COUNT }, (_, index) => seedItemId(index));
  await prisma.item.deleteMany({ where: { ownerId, id: { notIn: seedIds } } });
}
