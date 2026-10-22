import type { components } from '@/api/client';

// Typed from the generated contract: a contract change breaks a stale
// fixture at compile time.

type Schemas = components['schemas'];

/** The user a session belongs to. */
export const user: Schemas['SessionUser'] = {
  id: 'user-1',
  email: 'member@example.com',
  name: 'Member',
  role: 'member',
};

/** The same account, as GET /api/users/me tells it. */
export const account: Schemas['User'] = { ...user, createdAt: '2026-01-01T09:00:00.000Z' };

/** What sign-in and every renewal answer: a rotated pair, and who it belongs to. */
export function session(suffix = '1', owner: Schemas['SessionUser'] = user): Schemas['Session'] {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresIn: 900,
    user: owner,
  };
}

/** A server that offers everything (it sends email, sign-up is open). */
export const capabilities: Schemas['Capabilities'] = {
  passwordReset: true,
  signUp: true,
  emailChange: true,
  invitations: true,
};

export function item(index: number): Schemas['Item'] {
  return {
    id: `item-${index}`,
    title: `Item ${index}`,
    description: `Description ${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, index)).toISOString(),
  };
}

export function page(from: number, count: number, total: number): Schemas['ItemPage'] {
  return { items: Array.from({ length: count }, (_, offset) => item(from + offset)), total };
}
