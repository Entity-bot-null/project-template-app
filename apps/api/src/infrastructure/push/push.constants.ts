/** PushOptions, from the environment by default (tests override the provider). */
export const PUSH_OPTIONS = Symbol('PUSH_OPTIONS');
/** The push service's client (expo-push.client.ts); specs replace it. */
export const PUSH_CLIENT = Symbol('PUSH_CLIENT');
/** The templates by kind (push.templates.ts); specs replace them. */
export const PUSH_TEMPLATES = Symbol('PUSH_TEMPLATES');

/** Expo's push API (docs.expo.dev/push-notifications/sending-notifications). */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2';

// Expo's limits: at most 100 notifications per send request, at most 1000
// ids per receipts request.
export const PUSH_SEND_BATCH = 100;
export const PUSH_RECEIPT_BATCH = 1000;

// One request to the push service: connecting and the answer.
export const PUSH_REQUEST_TIMEOUT_MS = 10_000;

// The worker (push-worker.service.ts) looks for due notifications this often,
// and at once when one is queued in this process; for due receipts, every
// minute.
export const PUSH_POLL_INTERVAL_MS = 5_000;
export const PUSH_RECEIPT_POLL_INTERVAL_MS = 60_000;

// A claim's lease: longer than one request can take (the timeout), so a live
// worker never loses a batch it is still sending, and short enough that a
// crashed worker's batch is taken over within minutes.
export const PUSH_LEASE_MS = 60_000;

// Receipts: Expo has them about 15 minutes after a send and keeps them for
// 24 hours. A receipt not there yet is asked for again 15 minutes later; one
// still missing a day after the send never comes.
export const PUSH_RECEIPT_DELAY_MS = 15 * 60_000;
export const PUSH_RECEIPT_WINDOW_MS = 24 * 60 * 60_000;

// Retries: exponential from 30 seconds, at most an hour apart, with jitter
// (the email outbox's: mail/retry-delay.ts).
export const PUSH_MAX_ATTEMPTS = 5;

// Retention: finished rows (delivered, failed, expired) are deleted after 30
// days; a device whose token died is forgotten 30 days after, one that has not
// registered for 270 days too (the age at which Firebase treats a token as
// stale). The sweep runs every hour.
export const PUSH_RETENTION_DAYS = 30;
export const PUSH_DISABLED_DEVICE_RETENTION_DAYS = 30;
export const PUSH_STALE_DEVICE_DAYS = 270;
export const PUSH_SWEEP_INTERVAL_MS = 3_600_000;

// Queue statistics (the gauges and the health) are read this often.
export const PUSH_STATS_INTERVAL_MS = 30_000;

// Health: degraded while the latest send failed for a reason that is not the
// notification's own (the service down, credentials refused), for at most
// this long after it; or while the oldest waiting notification is older than
// this.
export const PUSH_FAILURE_DEGRADED_MS = 15 * 60_000;
export const PUSH_BACKLOG_DEGRADED_SEC = 15 * 60;

// How long a stopping API waits for the batch it is sending.
export const PUSH_SHUTDOWN_GRACE_MS = 10_000;
