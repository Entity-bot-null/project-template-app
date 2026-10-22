import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { api, type components, type PostBody } from '@/api/client';
import { expectSuccess, unwrapWith } from '@/api/unwrap';
import { UserSchema } from '@/auth/schemas';

// Administration (docs/mobile-architecture.md#accounts): the users, and the
// invitations to create an account. Only an admin reaches these screens
// (src/app/(app)/_layout.tsx), and the API authorizes every request anyway.

export type Invitation = components['schemas']['Invitation'];
export type AccountUser = components['schemas']['User'];

export const UserPageSchema = z.object({
  items: z.array(UserSchema),
  total: z.number().int().nonnegative(),
}) satisfies z.ZodType<components['schemas']['UserPage']>;

export const InvitationSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(['member', 'admin']),
  invitedBy: z.object({ id: z.string().min(1), name: z.string() }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
}) satisfies z.ZodType<Invitation>;

export const InvitationPageSchema = z.object({
  items: z.array(InvitationSchema),
  total: z.number().int().nonnegative(),
}) satisfies z.ZodType<components['schemas']['InvitationPage']>;

export const ADMIN_PAGE_SIZE = 20;

export const adminKeys = {
  all: ['admin'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  invitations: () => [...adminKeys.all, 'invitations'] as const,
};

interface Page {
  items: unknown[];
  total: number;
}

function nextOffset(lastPage: Page, pages: Page[]): number | undefined {
  const loaded = pages.reduce((count, page) => count + page.items.length, 0);
  return loaded < lastPage.total ? loaded : undefined;
}

/** Every account, newest first, a page at a time. */
export function useUsers() {
  return useInfiniteQuery({
    queryKey: adminKeys.users(),
    queryFn: ({ pageParam, signal }) =>
      unwrapWith(
        api.GET('/api/users', {
          params: { query: { limit: ADMIN_PAGE_SIZE, offset: pageParam } },
          signal,
        }),
        UserPageSchema,
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** Pending invitations, newest first, a page at a time. */
export function useInvitations() {
  return useInfiniteQuery({
    queryKey: adminKeys.invitations(),
    queryFn: ({ pageParam, signal }) =>
      unwrapWith(
        api.GET('/api/admin/invitations', {
          params: { query: { limit: ADMIN_PAGE_SIZE, offset: pageParam } },
          signal,
        }),
        InvitationPageSchema,
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** Invites an address with a role; inviting it again replaces its invitation and link. */
export function useInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['admin', 'invite'],
    mutationFn: (body: PostBody<'/api/admin/invitations'>) =>
      unwrapWith(api.POST('/api/admin/invitations', { body }), InvitationSchema),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.invitations() }),
  });
}

/** Revokes an invitation: its link stops working at once. */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['admin', 'revoke-invitation'],
    mutationFn: (id: string) =>
      expectSuccess(api.DELETE('/api/admin/invitations/{id}', { params: { path: { id } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.invitations() }),
  });
}
