import type { PushKind } from '../../prisma/generated/client.js';
import type { ClaimedPush, RenderedPush } from './push.types.js';

export interface PushTemplate {
  /** How long a queued notification stays worth sending; past it, it is dropped. */
  ttlMs: number;
  /** What it shows; null when it no longer applies (it is dropped). */
  render(message: ClaimedPush): RenderedPush | null;
}

export type PushTemplates = Readonly<Record<PushKind, PushTemplate>>;

// The security notice that also goes by email (mail/templates/password-
// changed.template.ts), to every device of the account: the person who did
// not change the password learns it where they look first. It opens Settings,
// from where the account is managed; the email carries the way back.
export const passwordChangedPush: PushTemplate = {
  ttlMs: 24 * 60 * 60_000,
  render: () => ({
    title: 'Your password was changed',
    body: 'If it was not you, reset your password now.',
    data: { url: '/settings' },
  }),
};

export const PUSH_TEMPLATE_REGISTRY: PushTemplates = {
  password_changed: passwordChangedPush,
};
