import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type PostBody } from '@/api/client';
import { expectSuccess, unwrapWith } from '@/api/unwrap';
import { SessionSchema, UserSchema } from '@/auth/schemas';
import { session } from '@/auth/session';

// The signed-in user's own account (docs/mobile-architecture.md#accounts).
// Every change confirms the current password. A changed password ends every
// session, this one included: the session the API answers is adopted, so
// this device carries on. A deleted account ends every session too: this
// device then forgets its own, as a sign-out does.

export const meKey = ['me'] as const;

/** The signed-in user. Changes rarely: fresh for five minutes. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: ({ signal }) => unwrapWith(api.GET('/api/users/me', { signal }), UserSchema),
    staleTime: 5 * 60_000,
  });
}

/** Changes the password; this device carries on with the session the API answers. */
export function useChangePassword() {
  return useMutation({
    mutationKey: ['account', 'password'],
    mutationFn: async (body: PostBody<'/api/account/password'>) =>
      session.adopt(await unwrapWith(api.POST('/api/account/password', { body }), SessionSchema)),
  });
}

/**
 * Asks to change the email address: a link goes to the new one, and the
 * address changes only once it is opened.
 */
export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['account', 'email'],
    mutationFn: (body: PostBody<'/api/account/email'>) =>
      expectSuccess(api.POST('/api/account/email', { body })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

/** Deletes the account for good, then ends the session on this device. */
export function useDeleteAccount() {
  return useMutation({
    mutationKey: ['account', 'deletion'],
    mutationFn: async (body: PostBody<'/api/account/deletion'>) => {
      await expectSuccess(api.POST('/api/account/deletion', { body }));
      await session.forget();
    },
  });
}
