import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import type { AuthSession } from '../auth/dto/auth.schemas.js';
import { checkPassword, hashPassword } from '../auth/password.js';
import { passwordProblem } from '../auth/password-policy.js';
import { lockUser, revokeSessionsLocked, SessionsService } from '../auth/sessions.service.js';
import { fieldError } from '../common/errors/validation-failed.exception.js';
import { MailOutboxService } from '../infrastructure/mail/mail-outbox.service.js';
import type { AccountDeletedPayload } from '../infrastructure/mail/templates/account-deleted.template.js';
import type { PasswordChangedPayload } from '../infrastructure/mail/templates/password-changed.template.js';
import { recordAccountDeletion } from '../observability/metrics.js';
import { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ACCOUNT_TRANSACTION = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

/** The last administrator cannot delete their account: nobody could invite or manage anyone. */
export const LAST_ADMIN = 'The only administrator cannot delete their account';

// What the signed-in person changes about their own account
// (docs/security.md#password-change, #account-deletion).
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly mail: MailOutboxService,
  ) {}

  /**
   * Replaces the password, after the current one is checked again (a session
   * alone is not enough: it may be someone else's). In one transaction under
   * the account's lock: the password, a raised securityVersion (every access
   * token ends at once), every session revoked, any reset link dropped, a
   * notice queued to the address. Then this device carries on in a new
   * session, the one returned; every other one is signed out.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });
    if (user === null) throw new NotFoundException('User not found');
    const problem = passwordProblem(newPassword, { email: user.email, name: user.name });
    if (problem !== undefined) throw fieldError('newPassword', problem);
    if (!(await checkPassword(user.passwordHash, currentPassword))) {
      // 403, not 401: the session is fine, the confirmation is not.
      throw new ForbiddenException('The current password is wrong');
    }

    const passwordHash = await hashPassword(newPassword);
    const payload: PasswordChangedPayload = { changedAt: new Date().toISOString(), via: 'change' };
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { email: true, passwordHash: true },
      });
      // Another change or a reset got there first: this request was checked
      // against a password that is no longer the account's.
      if (current?.passwordHash !== user.passwordHash) {
        throw new ConflictException('The password changed meanwhile');
      }
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, securityVersion: { increment: 1 } },
      });
      await revokeSessionsLocked(tx, user.id);
      await tx.accountToken.deleteMany({
        where: { userId: user.id, purpose: 'password_reset', usedAt: null },
      });
      await this.mail.enqueue(tx, {
        kind: 'password_changed',
        to: current.email,
        userId: user.id,
        payload,
      });
    }, ACCOUNT_TRANSACTION);
    this.mail.notifyQueued();
    this.logger.log(`Password changed by user ${user.id}: every other session ended`);

    const { passwordHash: _hash, ...authUser } = user;
    return this.auth.sessionFor(authUser, await this.sessions.create(user.id, passwordHash));
  }

  /**
   * Deletes the account for good (docs/adr/0012-account-deletion.md), after
   * its password is checked again (a session alone is not enough: it may be
   * someone else's). In one transaction under the account's lock: the user
   * row goes, and with it, by the database's cascades, everything it owns
   * (items, sessions, one-time links, its queued messages); a notice is
   * queued to the address, on a message that belongs to no account. Every
   * access token stops working at once (the guard finds no account), every
   * refresh token too (its session is gone). The last administrator is
   * refused: nobody could manage the others.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, passwordHash: true },
    });
    if (user === null) throw new NotFoundException('User not found');
    if (!(await checkPassword(user.passwordHash, password))) {
      // 403, not 401: the session is fine, the confirmation is not (and a 401
      // would make the app renew its session and send the request again).
      throw new ForbiddenException('The password is wrong');
    }

    const payload: AccountDeletedPayload = { deletedAt: new Date().toISOString() };
    await this.prisma.$transaction(async (tx) => {
      // Deletions one at a time (any instance): two of the last two
      // administrators cannot both pass the count below. Every deletion takes
      // it, whatever the role read above: deletions are rare, and the rule
      // then holds even if the role changed meanwhile.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('account-deletion', 0))`;
      await lockUser(tx, user.id);
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { email: true, role: true, passwordHash: true },
      });
      // Deleted meanwhile (another device), or its password changed since it
      // was checked: this request no longer speaks for the account.
      if (current === null) throw new NotFoundException('User not found');
      if (current.passwordHash !== user.passwordHash) {
        throw new ConflictException('The password changed meanwhile');
      }
      if (current.role === 'admin') {
        const admins = await tx.user.count({ where: { role: 'admin' } });
        if (admins <= 1) throw new ConflictException(LAST_ADMIN);
      }
      await tx.user.delete({ where: { id: user.id } });
      await this.mail.enqueue(tx, { kind: 'account_deleted', to: current.email, payload });
    }, ACCOUNT_TRANSACTION);
    this.mail.notifyQueued();
    recordAccountDeletion();
    this.logger.log(`Account ${user.id} deleted by its owner`);
  }
}
