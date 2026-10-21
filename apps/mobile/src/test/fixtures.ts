import type { components } from '@/api/client';

// Typed from the generated contract: a contract change breaks a stale
// fixture at compile time.

type Schemas = components['schemas'];

export const user: Schemas['User'] = {
  id: 'user-1',
  email: 'member@example.com',
  name: 'Member',
  role: 'member',
};

export function tokens(suffix = '1'): Schemas['Tokens'] {
  return { accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, expiresIn: 900 };
}

export function session(suffix = '1'): Schemas['Session'] {
  return { ...tokens(suffix), user };
}

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
