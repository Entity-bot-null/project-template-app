import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../../prisma/generated/client.js';
import type { ClaimedMessage } from '../mail.types.js';
import { accountDeletedTemplate } from './account-deleted.template.js';

const message = (payload: unknown): ClaimedMessage => ({
  id: 'm1',
  kind: 'account_deleted',
  recipient: 'ada@example.test',
  // The account is gone: the message belongs to none.
  userId: null,
  payload,
  attempts: 1,
  claimId: 'claim-1',
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(),
  requestId: null,
});

// Never reads the database: there is no account left to read.
const tx = { user: { findUnique: vi.fn() } };
const context = {
  tx: tx as unknown as Prisma.TransactionClient,
  product: 'Acme',
  appUrl: 'https://app.acme.test/app',
};

describe('the account deleted notice', () => {
  it('says when, and what to do if it was not the owner, with no link and no secret', async () => {
    const rendered = await accountDeletedTemplate.compose({
      ...context,
      message: message({ deletedAt: '2026-10-13T10:05:00.000Z' }),
    });
    expect(rendered?.subject).toBe('Your Acme account was deleted');
    expect(rendered?.text).toContain('deleted on 2026-10-13 10:05:00 UTC');
    expect(rendered?.text).toContain('This cannot be undone.');
    expect(rendered?.text).toContain('If you did not, someone knew your password');
    expect(rendered?.text).not.toMatch(/https?:\/\//);
    expect(rendered?.html).not.toContain('href=');
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    // A security notice: never held back by the per-address limits.
    expect(accountDeletedTemplate.limited).toBe(false);
  });

  it('still tells the address with a malformed payload', async () => {
    const rendered = await accountDeletedTemplate.compose({
      ...context,
      message: message({ nonsense: true }),
    });
    expect(rendered?.text).toContain('were deleted just now');
  });
});
