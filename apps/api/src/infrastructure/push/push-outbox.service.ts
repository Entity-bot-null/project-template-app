import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PushKind } from '../../prisma/generated/client.js';
import { currentRequestId } from '../../observability/request-context.js';
import { PUSH_OPTIONS, PUSH_TEMPLATES } from './push.constants.js';
import type { PushTemplates } from './push.templates.js';
import type { PushOptions } from './push.types.js';

export interface PushEnqueueInput {
  kind: PushKind;
  /** The account to notify: every one of its devices whose token works. */
  userId: string;
  /** Ids the template needs: never a secret, a token, an address or a text. */
  payload?: Record<string, string>;
  /** The request's id, to follow the notifications through the logs (default: the current request's). */
  requestId?: string;
}

// The queueing side of the push outbox (docs/architecture.md#push-notifications):
// a business change and the notifications it calls for are written in one
// transaction (the caller's), one row per device of the account, so they
// exist if and only if the change was committed. Delivery is PushWorker's.
@Injectable()
export class PushOutboxService {
  private queuedListener: (() => void) | undefined;

  constructor(
    @Inject(PUSH_OPTIONS) private readonly options: PushOptions,
    @Inject(PUSH_TEMPLATES) private readonly templates: PushTemplates,
  ) {}

  /** Push is on (PUSH_ENABLED); off, nothing is queued. */
  get enabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Queues the notification for every device of the account inside the
   * caller's transaction; answers how many were queued (0 when push is off or
   * the account has no device). A device registered after this commit does
   * not get it: a notification is about what happened before it.
   */
  async enqueue(tx: Prisma.TransactionClient, input: PushEnqueueInput): Promise<number> {
    if (!this.enabled) return 0;
    const devices = await tx.device.findMany({
      where: { userId: input.userId, disabledAt: null },
      select: { id: true },
    });
    if (devices.length === 0) return 0;
    const expiresAt = new Date(Date.now() + this.templates[input.kind].ttlMs);
    const requestId = input.requestId ?? currentRequestId() ?? null;
    const { count } = await tx.pushMessage.createMany({
      data: devices.map((device) => ({
        kind: input.kind,
        userId: input.userId,
        deviceId: device.id,
        payload: input.payload ?? {},
        expiresAt,
        requestId,
      })),
    });
    return count;
  }

  /**
   * Call after the transaction that queued notifications has committed: this
   * instance's worker looks at once instead of at its next poll. Best effort:
   * the poll finds them anyway.
   */
  notifyQueued(): void {
    this.queuedListener?.();
  }

  /** The worker of this process registers here. */
  onQueued(listener: () => void): void {
    this.queuedListener = listener;
  }
}
