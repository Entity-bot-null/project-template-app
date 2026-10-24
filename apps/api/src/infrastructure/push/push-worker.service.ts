import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ExternalServiceError } from '../../common/http/external-http.js';
import { errorSummary } from '../../common/logging/error-summary.js';
import { errorTracker } from '../../observability/error-tracker.js';
import {
  observePushOutbox,
  type PushOutcome,
  recordPushDelivery,
  recordPushDeviceDisabled,
} from '../../observability/metrics.js';
import { retryDelayMs } from '../mail/retry-delay.js';
import { MalformedPushResponseError } from './expo-push.client.js';
import {
  PUSH_BACKLOG_DEGRADED_SEC,
  PUSH_CLIENT,
  PUSH_FAILURE_DEGRADED_MS,
  PUSH_OPTIONS,
  PUSH_POLL_INTERVAL_MS,
  PUSH_RECEIPT_DELAY_MS,
  PUSH_RECEIPT_POLL_INTERVAL_MS,
  PUSH_RECEIPT_WINDOW_MS,
  PUSH_SHUTDOWN_GRACE_MS,
  PUSH_STATS_INTERVAL_MS,
  PUSH_SWEEP_INTERVAL_MS,
  PUSH_TEMPLATES,
} from './push.constants.js';
import { PushOutboxService } from './push-outbox.service.js';
import { type PushOutboxStats, PushStore } from './push.store.js';
import type { PushTemplates } from './push.templates.js';
import type {
  ClaimedPush,
  ClaimedReceipt,
  ExpoPushMessage,
  ExpoReceipt,
  ExpoTicket,
  PushClient,
  PushOptions,
} from './push.types.js';

/** disabled: not configured. ok: delivering. degraded: sends failing, or a backlog. */
export type PushHealth = 'ok' | 'degraded' | 'disabled';

/** Why a send failed, as the outbox records it (never the service's text). */
export interface PushSendFailure {
  category: string;
  /** Our credentials or setup were refused: an error report, not only a retry. */
  configuration: boolean;
}

// The Android channel the app creates (apps/mobile/src/lib/notifications).
const ANDROID_CHANNEL = 'default';

// The push service's per-notification errors that point at our setup rather
// than at one device: reported to the error tracker as well.
const CONFIGURATION_ERRORS = new Set(['InvalidCredentials', 'MismatchSenderId']);

const message = errorSummary;

/** The failure a send ended with, from what the client threw. */
export function classifySendError(error: unknown): PushSendFailure {
  if (error instanceof ExternalServiceError) {
    if (error.kind !== 'status') return { category: error.kind, configuration: false };
    const status = error.status ?? 0;
    return { category: `http_${String(status)}`, configuration: status === 401 || status === 403 };
  }
  if (error instanceof MalformedPushResponseError) {
    return { category: 'malformed_response', configuration: false };
  }
  return { category: 'unexpected', configuration: false };
}

// Delivers the push outbox (docs/architecture.md#push-notifications). Every
// API instance runs one worker; they share the queue safely (PushStore.claim).
// A worker claims up to 100 due notifications (Expo's batch), renders them
// from their kind, sends them in one request with no transaction open, then
// records each ticket, fenced by the claim. About 15 minutes later it reads
// their receipts: whether Apple or Google took them. A dead token
// (DeviceNotRegistered) disables its device; 429, 5xx, timeouts and the
// network are retried with the outbox's backoff. Delivery is at least once,
// like email's: a worker that dies between the send and recording its tickets
// leaves the batch to be sent again when the lease ends.
@Injectable()
export class PushWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private timers: NodeJS.Timeout[] = [];
  private draining: Promise<void> | undefined;
  private reading: Promise<void> | undefined;
  private wakeRequested = false;
  private stopping = false;
  private started = false;
  private stats: PushOutboxStats | undefined;
  private lastSend: { at: number; ok: boolean } | undefined;

  constructor(
    private readonly store: PushStore,
    private readonly outbox: PushOutboxService,
    @Inject(PUSH_OPTIONS) private readonly options: PushOptions,
    @Inject(PUSH_CLIENT) private readonly client: PushClient,
    @Inject(PUSH_TEMPLATES) private readonly templates: PushTemplates,
  ) {}

  onApplicationBootstrap(): void {
    // Retention runs whether or not push is on: rows and devices left from
    // when it was on are cleaned up all the same.
    const sweep = setInterval(() => void this.sweep(), PUSH_SWEEP_INTERVAL_MS).unref();
    void this.sweep();
    if (!this.outbox.enabled) {
      this.timers = [sweep];
      return;
    }
    this.started = true;
    this.outbox.onQueued(() => {
      this.wake();
    });
    observePushOutbox(() => this.stats);
    // Timers never keep the process alive; each run catches its own errors.
    this.timers = [
      setInterval(() => {
        this.wake();
      }, PUSH_POLL_INTERVAL_MS).unref(),
      setInterval(() => void this.readReceipts(), PUSH_RECEIPT_POLL_INTERVAL_MS).unref(),
      setInterval(() => void this.refreshStats(), PUSH_STATS_INTERVAL_MS).unref(),
      sweep,
    ];
    void this.refreshStats();
    this.wake();
  }

  /** Stops claiming, and waits a little for the batch being sent (else its lease brings it back). */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    const running = [this.draining, this.reading].filter((work) => work !== undefined);
    if (running.length > 0) {
      let timeout: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all(running),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, PUSH_SHUTDOWN_GRACE_MS).unref();
        }),
      ]);
      clearTimeout(timeout);
    }
  }

  /** What readiness reports; never fails the probe (push is optional). */
  health(now: number = Date.now()): PushHealth {
    if (!this.outbox.enabled) return 'disabled';
    const failing =
      this.lastSend !== undefined &&
      !this.lastSend.ok &&
      now - this.lastSend.at < PUSH_FAILURE_DEGRADED_MS;
    const backlog = (this.stats?.oldestAgeSeconds ?? 0) > PUSH_BACKLOG_DEGRADED_SEC;
    return failing || backlog ? 'degraded' : 'ok';
  }

  /** Looks for due notifications now; one drain at a time, another right after if asked meanwhile. */
  wake(): void {
    if (this.stopping || !this.started) return;
    if (this.draining !== undefined) {
      this.wakeRequested = true;
      return;
    }
    this.startDrain();
  }

  /**
   * Sends every due notification now, and resolves when none is left: after
   * the drain in progress, if any. For whoever must know the queue was
   * worked through (the specs, an operator's command).
   */
  async runOnce(): Promise<void> {
    await this.idle();
    if (this.stopping || !this.started) return;
    this.startDrain();
    await this.idle();
  }

  /** Resolves when the current drain is over. */
  async idle(): Promise<void> {
    while (this.draining !== undefined) await this.draining;
  }

  /** Reads every due receipt now; one pass at a time (the timer's, or this one's). */
  async readReceipts(): Promise<void> {
    if (this.stopping || !this.started) return;
    if (this.reading !== undefined) {
      await this.reading;
      return;
    }
    this.reading = this.receiptPass().finally(() => {
      this.reading = undefined;
    });
    await this.reading;
  }

  private startDrain(): void {
    this.draining = this.drain().finally(() => {
      this.draining = undefined;
      if (this.wakeRequested) {
        this.wakeRequested = false;
        this.wake();
      }
    });
  }

  private async drain(): Promise<void> {
    try {
      while (!this.stopping) {
        const batch = await this.store.claim();
        if (batch.length === 0) return;
        await this.deliver(batch);
      }
    } catch (error) {
      // The database is down, most likely: the next poll tries again.
      this.logger.warn(`Push worker paused: ${message(error)}`);
    }
  }

  private async deliver(batch: (ClaimedPush & { deviceDisabled: boolean })[]): Promise<void> {
    const sendable: { claim: ClaimedPush; message: ExpoPushMessage }[] = [];
    for (const claim of batch) {
      if (claim.attempts > this.options.maxAttempts) {
        // Taken over again and again: its worker never got to record an outcome.
        await this.fail(claim, 'attempts_exhausted');
      } else if (claim.expiresAt.getTime() <= Date.now()) {
        await this.expire(claim, 'expired');
      } else if (claim.deviceDisabled) {
        await this.expire(claim, 'device_disabled');
      } else {
        const rendered = this.templates[claim.kind].render(claim);
        if (rendered === null) {
          await this.expire(claim, 'not_applicable');
        } else {
          sendable.push({
            claim,
            message: {
              to: claim.pushToken,
              title: rendered.title,
              body: rendered.body,
              data: rendered.data,
              sound: 'default',
              priority: 'high',
              channelId: ANDROID_CHANNEL,
            },
          });
        }
      }
    }
    if (sendable.length === 0) return;

    let tickets: ExpoTicket[];
    try {
      tickets = await this.client.send(sendable.map(({ message: push }) => push));
    } catch (error) {
      const failure = classifySendError(error);
      this.lastSend = { at: Date.now(), ok: false };
      if (failure.configuration) this.reportConfiguration(failure.category);
      if (failure.category === 'unexpected') {
        this.logger.warn(`Unexpected error sending notifications: ${message(error)}`);
      }
      for (const { claim } of sendable) await this.retryLater(claim, failure.category);
      return;
    }
    this.lastSend = { at: Date.now(), ok: true };
    for (const [index, { claim }] of sendable.entries()) {
      // The client checks there is one ticket per notification, in order; a
      // missing one is a malformed answer, and its notification is retried.
      const ticket = tickets[index];
      if (ticket === undefined) await this.retryLater(claim, 'malformed_response');
      else await this.recordTicket(claim, ticket);
    }
  }

  private async recordTicket(claim: ClaimedPush, ticket: ExpoTicket): Promise<void> {
    if (ticket.status === 'ok') {
      recordPushDelivery(claim.kind, 'sent');
      if (!(await this.store.markSent(claim, ticket.id, PUSH_RECEIPT_DELAY_MS))) {
        this.logger.warn(
          `Sent ${this.label(claim)}, but its lease had run out: another worker may send it again`,
        );
      }
      return;
    }
    const code = errorCode(ticket.details?.error);
    if (code === 'DeviceNotRegistered') {
      if (await this.store.disableDevice(claim.deviceId, claim.pushToken)) {
        recordPushDeviceDisabled();
        this.logger.log(`Device ${claim.deviceId} disabled: its token is no longer registered`);
      }
      await this.finish(claim, 'unregistered', code);
    } else if (code === 'MessageRateExceeded') {
      await this.retryLater(claim, code);
    } else {
      if (CONFIGURATION_ERRORS.has(code)) this.reportConfiguration(code);
      await this.fail(claim, code);
    }
  }

  private async receiptPass(): Promise<void> {
    try {
      while (!this.stopping) {
        const claimed = await this.store.claimReceipts();
        if (claimed.length === 0) return;
        let receipts: Record<string, ExpoReceipt>;
        try {
          receipts = await this.client.receipts(claimed.map((receipt) => receipt.ticketId));
        } catch (error) {
          this.logger.warn(
            `Could not read ${String(claimed.length)} push receipts: ${classifySendError(error).category}; asking again later`,
          );
          for (const receipt of claimed) {
            await this.store.recheckReceipt(receipt, PUSH_RECEIPT_DELAY_MS);
          }
          return;
        }
        for (const receipt of claimed)
          await this.recordReceipt(receipt, receipts[receipt.ticketId]);
      }
    } catch (error) {
      this.logger.warn(`Push receipts paused: ${message(error)}`);
    }
  }

  private async recordReceipt(claim: ClaimedReceipt, receipt: ExpoReceipt | undefined) {
    if (receipt === undefined) {
      // Not there yet, or never coming: Expo keeps receipts for a day.
      if (Date.now() - claim.sentAt.getTime() >= PUSH_RECEIPT_WINDOW_MS) {
        recordPushDelivery(claim.kind, 'failed');
        await this.store.markReceiptFailed(claim, 'no_receipt');
      } else {
        await this.store.recheckReceipt(claim, PUSH_RECEIPT_DELAY_MS);
      }
      return;
    }
    if (receipt.status === 'ok') {
      recordPushDelivery(claim.kind, 'delivered');
      await this.store.markDelivered(claim);
      return;
    }
    const code = errorCode(receipt.details?.error);
    if (code === 'DeviceNotRegistered') {
      if (await this.store.disableDeviceUnchangedSince(claim.deviceId, claim.sentAt)) {
        recordPushDeviceDisabled();
        this.logger.log(`Device ${claim.deviceId} disabled: its token is no longer registered`);
      }
      recordPushDelivery(claim.kind, 'unregistered');
      await this.store.markReceiptFailed(claim, code);
    } else if (code === 'MessageRateExceeded' && claim.attempts < this.options.maxAttempts) {
      recordPushDelivery(claim.kind, 'retry');
      await this.store.resendLater(claim, retryDelayMs(claim.attempts), code);
    } else {
      if (CONFIGURATION_ERRORS.has(code)) this.reportConfiguration(code);
      recordPushDelivery(claim.kind, 'failed');
      await this.store.markReceiptFailed(claim, code);
      this.logger.error(`Push ${claim.kind} notification ${claim.id} refused: ${code}`);
    }
  }

  // Every send outcome is counted here, whatever led to it: the alerts read them.
  private async retryLater(claim: ClaimedPush, category: string) {
    if (claim.attempts >= this.options.maxAttempts) {
      await this.fail(claim, category);
      return;
    }
    recordPushDelivery(claim.kind, 'retry');
    const delayMs = retryDelayMs(claim.attempts);
    await this.store.reschedule(claim, delayMs, category);
    this.logger.warn(
      `Could not send ${this.label(claim)}: ${category}; retrying in ${String(Math.round(delayMs / 1000))} s`,
    );
  }

  private async fail(claim: ClaimedPush, category: string) {
    await this.finish(claim, 'failed', category);
    this.logger.error(`Gave up on ${this.label(claim)}: ${category}`);
  }

  private async finish(claim: ClaimedPush, outcome: PushOutcome, category: string) {
    recordPushDelivery(claim.kind, outcome);
    await this.store.markFailed(claim, category);
  }

  private async expire(claim: ClaimedPush, reason: string) {
    recordPushDelivery(claim.kind, 'expired');
    await this.store.markExpired(claim, reason);
    this.logger.warn(`Dropped ${this.label(claim)}: ${reason}`);
  }

  private label(claim: ClaimedPush): string {
    return `${claim.kind} notification ${claim.id} (attempt ${String(claim.attempts)})`;
  }

  private reportConfiguration(category: string): void {
    errorTracker().capture(new Error(`Push service refused the configuration (${category})`), {
      level: 'error',
      origin: 'dependency',
      dependency: 'expo-push',
    });
  }

  private async refreshStats(): Promise<void> {
    try {
      this.stats = await this.store.stats();
    } catch (error) {
      this.logger.warn(`Could not read the push queue: ${message(error)}`);
    }
  }

  private async sweep(): Promise<void> {
    try {
      const { expired, deleted, devices } = await this.store.sweep();
      if (expired + deleted + devices > 0) {
        this.logger.log(
          `Push retention: dropped ${String(expired)} stale pending notifications, deleted ${String(deleted)} old ones and ${String(devices)} devices`,
        );
      }
    } catch (error) {
      this.logger.warn(`Push retention sweep failed: ${message(error)}`);
    }
  }
}

/** The error code of a ticket or receipt: Expo's names only, never its text. */
function errorCode(error: string | undefined): string {
  return error !== undefined && /^[A-Za-z]{1,64}$/.test(error) ? error : 'unknown';
}
