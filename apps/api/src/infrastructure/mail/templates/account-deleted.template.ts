import { z } from 'zod';
import { renderMail } from './layout.js';
import type { MailTemplate } from './registry.js';

/** What the message is about: queued with the deletion (account/account.service.ts). */
export const AccountDeletedPayloadSchema = z.object({
  /** When the account was deleted, ISO 8601. */
  deletedAt: z.iso.datetime(),
});
export type AccountDeletedPayload = z.infer<typeof AccountDeletedPayloadSchema>;

// A notice to the address of an account that was just deleted (the person
// asked for it in the app, with their password): a person who did not do it
// learns it at once. The account is gone, so the message belongs to no one
// (no userId): its address is kept on the outbox row until it is sent, then
// cleared like any other. It carries no secret and no link (there is nothing
// left to sign in to), and is never held back by the per-address limits.
export const accountDeletedTemplate: MailTemplate = {
  limited: false,
  ttlMs: 24 * 60 * 60_000,
  compose({ message, product }) {
    const payload = AccountDeletedPayloadSchema.safeParse(message.payload);
    const when = payload.success
      ? `on ${payload.data.deletedAt.replace('T', ' ').replace(/\.\d+Z$|Z$/, '')} UTC`
      : 'just now';
    return Promise.resolve(
      renderMail(
        {
          subject: `Your ${product} account was deleted`,
          heading: 'Your account was deleted',
          paragraphs: [
            `Your ${product} account and everything it held were deleted ${when}, as requested from the app.`,
            'Every session of the account was signed out. This cannot be undone.',
          ],
          footer: [
            'If you asked for this, there is nothing to do.',
            'If you did not, someone knew your password: change it wherever else you use it.',
          ],
        },
        product,
      ),
    );
  },
};
