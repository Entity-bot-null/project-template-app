import type { PushKind } from '../../prisma/generated/client.js';

/** The push infrastructure's settings: from the environment by default (tests override PUSH_OPTIONS). */
export interface PushOptions {
  /** PUSH_ENABLED: off, nothing is queued and the worker never starts. */
  enabled: boolean;
  /** EXPO_ACCESS_TOKEN, for Expo's enhanced push security; optional. */
  accessToken: string | undefined;
  /** Expo's push API (EXPO_PUSH_URL); specs point it at a fake service. */
  baseUrl: string;
  maxAttempts: number;
}

/** A notification the worker claimed, with the device it goes to. */
export interface ClaimedPush {
  id: string;
  kind: PushKind;
  userId: string;
  deviceId: string;
  pushToken: string;
  payload: unknown;
  /** Attempts started, this one included. */
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  requestId: string | null;
}

/** A claimed notification, with its device as it is now (PushStore.claim). */
export interface ClaimedSend extends ClaimedPush {
  /** The push service reported the device's token dead: nothing goes to it. */
  deviceDisabled: boolean;
  /**
   * The installation moved to another account since this was queued (a
   * sign-in on a shared phone): the account it is for gets no notices there.
   */
  deviceMoved: boolean;
}

/** A sent notification whose receipt the worker claimed. */
export interface ClaimedReceipt {
  id: string;
  kind: PushKind;
  deviceId: string;
  ticketId: string;
  attempts: number;
  sentAt: Date;
}

/**
 * What a notification shows: lock screens show it, and it travels through
 * Apple and Google, so never personal data. `data.url` is an internal path
 * the app opens when the notification is tapped, after its link allowlist
 * accepts it (apps/mobile/src/lib/links.ts).
 */
export interface RenderedPush {
  title: string;
  body: string;
  data: { url: string };
}

/** One notification as Expo's push API takes it. */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  priority: 'high';
  channelId: string;
}

/** A send's answer for one notification, in the order they were sent. */
export type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

/** A receipt: whether Apple or Google took the notification. */
export type ExpoReceipt =
  { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } };

/** The push service, as the worker uses it. */
export interface PushClient {
  send(messages: readonly ExpoPushMessage[]): Promise<ExpoTicket[]>;
  /** The receipts there are, by ticket id; ids without one yet are missing. */
  receipts(ticketIds: readonly string[]): Promise<Record<string, ExpoReceipt>>;
}
