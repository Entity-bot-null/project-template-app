import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { type components, type PostBody as Body, publicApi } from '@/api/client';
import { expectSuccess, unwrapWith } from '@/api/unwrap';
import { SessionSchema } from '@/auth/schemas';
import { session } from '@/auth/session';

// The account flows that need no session (docs/mobile-architecture.md#accounts):
// what this server offers, signing up, recovering a password, and the
// screens of the links the API emails. The ones that answer a session (a
// confirmed sign-up, an accepted invitation) hand it to the session, which
// adopts it; the navigation follows (src/app/_layout.tsx).

export type Capabilities = components['schemas']['Capabilities'];

export const CapabilitiesSchema = z.object({
  passwordReset: z.boolean(),
  signUp: z.boolean(),
  emailChange: z.boolean(),
  invitations: z.boolean(),
}) satisfies z.ZodType<Capabilities>;

export const capabilitiesKey = ['capabilities'] as const;

/**
 * What this deployment offers (a server that sends no email offers no
 * password recovery, change of email or invitations; sign-up may be closed).
 * Changes only with a deployment: fresh for an hour. While unknown (loading,
 * offline), screens offer none of it.
 */
export function useCapabilities() {
  return useQuery({
    queryKey: capabilitiesKey,
    queryFn: ({ signal }) =>
      unwrapWith(publicApi.GET('/api/auth/capabilities', { signal }), CapabilitiesSchema),
    staleTime: 60 * 60_000,
  });
}

/** Asks for a link to confirm a new account; the account exists once it is confirmed. */
export function useSignUp() {
  return useMutation({
    mutationKey: ['auth', 'sign-up'],
    mutationFn: (body: Body<'/api/auth/sign-ups'>) =>
      expectSuccess(publicApi.POST('/api/auth/sign-ups', { body })),
  });
}

/** Confirms a sign-up with its link's token and the password chosen then: signs in. */
export function useConfirmSignUp() {
  return useMutation({
    mutationKey: ['auth', 'confirm-sign-up'],
    mutationFn: async (body: Body<'/api/auth/sign-ups/confirm'>) =>
      session.adopt(
        await unwrapWith(publicApi.POST('/api/auth/sign-ups/confirm', { body }), SessionSchema),
      ),
  });
}

/** Asks for a password reset link; the answer is the same whether the address has an account. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationKey: ['auth', 'password-reset'],
    mutationFn: (body: Body<'/api/auth/password-resets'>) =>
      expectSuccess(publicApi.POST('/api/auth/password-resets', { body })),
  });
}

/** Chooses a new password with a reset link's token; every session of the account ends. */
export function useResetPassword() {
  return useMutation({
    mutationKey: ['auth', 'reset-password'],
    mutationFn: (body: Body<'/api/auth/password-resets/confirm'>) =>
      expectSuccess(publicApi.POST('/api/auth/password-resets/confirm', { body })),
  });
}

/** Accepts an invitation with its link's token, a name and a password: signs in. */
export function useAcceptInvitation() {
  return useMutation({
    mutationKey: ['auth', 'accept-invitation'],
    mutationFn: async (body: Body<'/api/auth/invitations/accept'>) =>
      session.adopt(
        await unwrapWith(publicApi.POST('/api/auth/invitations/accept', { body }), SessionSchema),
      ),
  });
}

/** Confirms a new email address; every session of the account ends. */
export function useConfirmEmailChange() {
  return useMutation({
    mutationKey: ['auth', 'confirm-email-change'],
    mutationFn: (body: Body<'/api/auth/email-changes/confirm'>) =>
      expectSuccess(publicApi.POST('/api/auth/email-changes/confirm', { body })),
  });
}

/** Undoes a change of email with a new password; every session of the account ends. */
export function useRevertEmailChange() {
  return useMutation({
    mutationKey: ['auth', 'revert-email-change'],
    mutationFn: (body: Body<'/api/auth/email-changes/revert'>) =>
      expectSuccess(publicApi.POST('/api/auth/email-changes/revert', { body })),
  });
}
