import { z } from 'zod';
import {
  createExternalHttpClient,
  type ExternalHttpClientOptions,
} from '../../common/http/external-http.js';
import { PUSH_REQUEST_TIMEOUT_MS } from './push.constants.js';
import type {
  ExpoPushMessage,
  ExpoReceipt,
  ExpoTicket,
  PushClient,
  PushOptions,
} from './push.types.js';

const ErrorDetailsSchema = z.object({ error: z.string().optional() }).optional();

const TicketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string().min(1) }),
  z.object({ status: z.literal('error'), message: z.string(), details: ErrorDetailsSchema }),
]);

const SendResponseSchema = z.object({ data: z.array(TicketSchema) });

const ReceiptSchema = z.union([
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('error'), message: z.string(), details: ErrorDetailsSchema }),
]);

const ReceiptsResponseSchema = z.object({ data: z.record(z.string(), ReceiptSchema) });

/** The push service answered, but not in the shape its documentation gives. */
export class MalformedPushResponseError extends Error {
  constructor(what: string) {
    super(`Expo push service: malformed ${what} answer`);
    this.name = 'MalformedPushResponseError';
  }
}

// Expo's push API (docs/architecture.md#push-notifications), through the
// shared client for external services: a timeout per request, the request id,
// one metric (dependency "expo-push") and one log line per call, and an
// ExternalServiceError on failure. Sends are POSTs, never retried by the
// client: the worker owns retries, with the outbox's backoff (a retried send
// could notify twice). Answers are checked before the worker trusts them.
export function createExpoPushClient(
  options: Pick<PushOptions, 'accessToken' | 'baseUrl'>,
  http: Pick<ExternalHttpClientOptions, 'fetch' | 'sleep'> = {},
): PushClient {
  const client = createExternalHttpClient({
    name: 'expo-push',
    baseUrl: options.baseUrl,
    timeoutMs: PUSH_REQUEST_TIMEOUT_MS,
    // Enhanced push security: without the token, Expo accepts any sender
    // that knows a device's token. Never logged.
    headers: (): Record<string, string> =>
      options.accessToken === undefined ? {} : { Authorization: `Bearer ${options.accessToken}` },
    ...http,
  });

  return {
    async send(messages: readonly ExpoPushMessage[]): Promise<ExpoTicket[]> {
      const { body } = await client.request({ method: 'POST', path: 'push/send', body: messages });
      const parsed = SendResponseSchema.safeParse(body);
      // One ticket per notification, in their order: anything else cannot be
      // matched back to the rows, so the batch is treated as not sent.
      if (!parsed.success || parsed.data.data.length !== messages.length) {
        throw new MalformedPushResponseError('send');
      }
      return parsed.data.data;
    },

    async receipts(ticketIds: readonly string[]): Promise<Record<string, ExpoReceipt>> {
      const { body } = await client.request({
        method: 'POST',
        path: 'push/getReceipts',
        body: { ids: ticketIds },
        // Reading receipts changes nothing: safe to retry.
        idempotent: true,
      });
      const parsed = ReceiptsResponseSchema.safeParse(body);
      if (!parsed.success) throw new MalformedPushResponseError('receipts');
      return parsed.data.data;
    },
  };
}
