import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrapWith } from '@/api/unwrap';
import { UserSchema } from '@/auth/schemas';

export const meKey = ['me'] as const;

/** The signed-in user. Changes rarely: fresh for five minutes. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: ({ signal }) => unwrapWith(api.GET('/api/users/me', { signal }), UserSchema),
    staleTime: 5 * 60_000,
  });
}
