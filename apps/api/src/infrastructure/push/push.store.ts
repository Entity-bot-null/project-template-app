import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../prisma/generated/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  PUSH_DISABLED_DEVICE_RETENTION_DAYS,
  PUSH_LEASE_MS,
  PUSH_RECEIPT_BATCH,
  PUSH_RETENTION_DAYS,
  PUSH_SEND_BATCH,
  PUSH_STALE_DEVICE_DAYS,
} from './push.constants.js';
import type { ClaimedPush, ClaimedReceipt, ClaimedSend } from './push.types.js';

const DAY_MS = 86_400_000;

export interface PushOutboxStats {
  /** Notifications still to send: pending, or being sent. */
  waiting: number;
  /** Age of the oldest of them, 0 when there is none. */
  oldestAgeSeconds: number;
}

/** The claim a send transition was made under: only that claim may finish it. */
type SendClaim = Pick<ClaimedPush, 'id' | 'attempts'>;
/** The receipt a transition was made for: only a sent row with that ticket. */
type ReceiptClaim = Pick<ClaimedReceipt, 'id' | 'ticketId'>;

// Every read and write of the push outbox's delivery state (the queueing side
// is PushOutboxService.enqueue, in the caller's transaction). Claims are one
// atomic statement each; every transition after a claim is fenced by it (a
// send by status sending and the attempt, a receipt by status sent and the
// ticket), so a worker whose lease ran out can no longer finish what another
// took over. The email outbox's store (mail/mail.store.ts), for batches.
@Injectable()
export class PushStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Takes up to `limit` due notifications, and those whose worker's lease ran
   * out, with their device's token and state now (disabled, or moved to
   * another account since the notification was queued), and leases them to
   * this worker. SKIP LOCKED lets several workers claim side by side; the
   * attempt is counted here, before the send.
   */
  async claim(
    limit: number = PUSH_SEND_BATCH,
    leaseMs: number = PUSH_LEASE_MS,
  ): Promise<ClaimedSend[]> {
    return this.prisma.$queryRaw<ClaimedSend[]>`
      WITH claimed AS (
        UPDATE "push_messages"
        SET "status" = 'sending',
            "attempts" = "attempts" + 1,
            "locked_until" = now() + make_interval(secs => ${leaseMs / 1000}::double precision),
            "updated_at" = now()
        WHERE "id" IN (
          SELECT "id" FROM "push_messages"
          WHERE ("status" = 'pending' AND "next_attempt_at" <= now())
             OR ("status" = 'sending' AND "locked_until" < now())
          ORDER BY "next_attempt_at", "id"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "kind", "user_id", "device_id", "payload", "attempts", "expires_at",
                  "created_at", "request_id"
      )
      SELECT c."id", c."kind", c."user_id" AS "userId", c."device_id" AS "deviceId",
             d."push_token" AS "pushToken", (d."disabled_at" IS NOT NULL) AS "deviceDisabled",
             (d."user_id" <> c."user_id") AS "deviceMoved",
             c."payload", c."attempts", c."expires_at" AS "expiresAt",
             c."created_at" AS "createdAt", c."request_id" AS "requestId"
      FROM claimed c
      JOIN "devices" d ON d."id" = c."device_id"
      ORDER BY c."id"`;
  }

  /** The push service took it: its ticket, and when to read its receipt. */
  async markSent(claim: SendClaim, ticketId: string, receiptDelayMs: number): Promise<boolean> {
    const now = Date.now();
    return this.finishSend(claim, {
      status: 'sent',
      ticketId,
      sentAt: new Date(now),
      receiptCheckAt: new Date(now + receiptDelayMs),
      lockedUntil: null,
      lastError: null,
    });
  }

  /** Back to pending, for another attempt after `delayMs`. */
  async reschedule(claim: SendClaim, delayMs: number, category: string): Promise<boolean> {
    return this.finishSend(claim, {
      status: 'pending',
      nextAttemptAt: new Date(Date.now() + delayMs),
      lockedUntil: null,
      lastError: category,
    });
  }

  /** Given up: kept, for inspection, until the retention sweep. */
  async markFailed(claim: SendClaim, category: string): Promise<boolean> {
    return this.finishSend(claim, { status: 'failed', lockedUntil: null, lastError: category });
  }

  /** Dropped unsent (too late, or no longer applies). */
  async markExpired(claim: SendClaim, reason: string): Promise<boolean> {
    return this.finishSend(claim, { status: 'expired', lockedUntil: null, lastError: reason });
  }

  /** Takes up to `limit` sent notifications whose receipt is due, and leases them. */
  async claimReceipts(
    limit: number = PUSH_RECEIPT_BATCH,
    leaseMs: number = PUSH_LEASE_MS,
  ): Promise<ClaimedReceipt[]> {
    return this.prisma.$queryRaw<ClaimedReceipt[]>`
      UPDATE "push_messages"
      SET "locked_until" = now() + make_interval(secs => ${leaseMs / 1000}::double precision),
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id" FROM "push_messages"
        WHERE "status" = 'sent' AND "receipt_check_at" <= now()
          AND ("locked_until" IS NULL OR "locked_until" < now())
        ORDER BY "receipt_check_at", "id"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "kind", "device_id" AS "deviceId", "ticket_id" AS "ticketId", "attempts",
                "sent_at" AS "sentAt"`;
  }

  /** Apple or Google took it. */
  async markDelivered(claim: ReceiptClaim): Promise<boolean> {
    return this.finishReceipt(claim, {
      status: 'delivered',
      receiptCheckAt: null,
      lockedUntil: null,
    });
  }

  /** The receipt says it was refused for good (or never came). */
  async markReceiptFailed(claim: ReceiptClaim, category: string): Promise<boolean> {
    return this.finishReceipt(claim, {
      status: 'failed',
      receiptCheckAt: null,
      lockedUntil: null,
      lastError: category,
    });
  }

  /** No receipt yet: asked for again after `delayMs`. */
  async recheckReceipt(claim: ReceiptClaim, delayMs: number): Promise<boolean> {
    return this.finishReceipt(claim, {
      receiptCheckAt: new Date(Date.now() + delayMs),
      lockedUntil: null,
    });
  }

  /** The receipt says to try again later (MessageRateExceeded): back to pending, a new send. */
  async resendLater(claim: ReceiptClaim, delayMs: number, category: string): Promise<boolean> {
    return this.finishReceipt(claim, {
      status: 'pending',
      ticketId: null,
      sentAt: null,
      receiptCheckAt: null,
      nextAttemptAt: new Date(Date.now() + delayMs),
      lockedUntil: null,
      lastError: category,
    });
  }

  /**
   * The push service says a token is dead (DeviceNotRegistered): nothing is
   * sent to the device until the app registers again. Only while the device
   * still has that token: one registered again since keeps its new one.
   */
  async disableDevice(deviceId: string, pushToken: string): Promise<boolean> {
    const { count } = await this.prisma.device.updateMany({
      where: { id: deviceId, pushToken, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    return count === 1;
  }

  /**
   * The same for a receipt, which names no token: only when the device has
   * not registered since the notification was sent.
   */
  async disableDeviceUnchangedSince(deviceId: string, sentAt: Date): Promise<boolean> {
    const { count } = await this.prisma.device.updateMany({
      where: { id: deviceId, disabledAt: null, lastSeenAt: { lte: sentAt } },
      data: { disabledAt: new Date() },
    });
    return count === 1;
  }

  async stats(): Promise<PushOutboxStats> {
    const { _count, _min } = await this.prisma.pushMessage.aggregate({
      where: { status: { in: ['pending', 'sending'] } },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    const oldest = _min.createdAt;
    return {
      waiting: _count._all,
      oldestAgeSeconds: oldest === null ? 0 : Math.max(0, (Date.now() - oldest.getTime()) / 1000),
    };
  }

  /**
   * Retention (docs/architecture.md#push-notifications): pending rows a day
   * past their validity are dropped (push was turned off since, say); finished
   * rows go after PUSH_RETENTION_DAYS; a device whose token died goes after
   * PUSH_DISABLED_DEVICE_RETENTION_DAYS, one that has not registered for
   * PUSH_STALE_DEVICE_DAYS too.
   */
  async sweep(now: number = Date.now()): Promise<{
    expired: number;
    deleted: number;
    devices: number;
  }> {
    const { count: expired } = await this.prisma.pushMessage.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date(now - DAY_MS) } },
      data: { status: 'expired', lastError: 'expired' },
    });
    const { count: deleted } = await this.prisma.pushMessage.deleteMany({
      where: {
        status: { in: ['delivered', 'failed', 'expired'] },
        createdAt: { lt: new Date(now - PUSH_RETENTION_DAYS * DAY_MS) },
      },
    });
    const { count: devices } = await this.prisma.device.deleteMany({
      where: {
        OR: [
          { disabledAt: { lt: new Date(now - PUSH_DISABLED_DEVICE_RETENTION_DAYS * DAY_MS) } },
          { lastSeenAt: { lt: new Date(now - PUSH_STALE_DEVICE_DAYS * DAY_MS) } },
        ],
      },
    });
    return { expired, deleted, devices };
  }

  private async finishSend(claim: SendClaim, data: Prisma.PushMessageUpdateManyMutationInput) {
    const { count } = await this.prisma.pushMessage.updateMany({
      where: { id: claim.id, status: 'sending', attempts: claim.attempts },
      data,
    });
    return count === 1;
  }

  private async finishReceipt(
    claim: ReceiptClaim,
    data: Prisma.PushMessageUpdateManyMutationInput,
  ) {
    const { count } = await this.prisma.pushMessage.updateMany({
      where: { id: claim.id, status: 'sent', ticketId: claim.ticketId },
      data,
    });
    return count === 1;
  }
}
