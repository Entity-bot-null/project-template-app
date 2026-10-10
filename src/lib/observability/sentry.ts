import * as Sentry from '@sentry/react-native';
import type {
  Breadcrumb as SentryBreadcrumb,
  ErrorEvent,
  Event,
  TransactionEvent,
} from '@sentry/react-native';
import * as Updates from 'expo-updates';

import type { ErrorReporter } from './errorReporter';
import { redact, redactText, redactUrl } from './redact';

// The Sentry adapter: the only module that imports the SDK (an ESLint rule
// enforces it). Started by src/lib/observability/index.ts when the build has
// a DSN. Crashes (JavaScript and native), unhandled errors and the reports of
// reportError() reach Sentry, with the release, the build and the OTA update
// they came from. Nothing personal: every category of data the SDK could
// collect on its own is off, and every event is scrubbed before it leaves
// (SECURITY.md#logging-and-reports).

export interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
}

export function startSentry(config: SentryConfig): ErrorReporter {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    // Release and dist come from the native build (version and build
    // number); the OTA update is tagged below.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // A failed HTTP request is not an event: its URL and body may carry
    // personal data. Failures the app cares about are reported with context.
    enableCaptureFailedRequests: false,
    enableAutoSessionTracking: true,
    tracesSampleRate: config.tracesSampleRate,
    maxBreadcrumbs: 50,
    beforeSend: scrubEvent,
    // Transactions skip beforeSend; with tracing off there are none.
    beforeSendTransaction: scrubTransaction,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  Sentry.setTag('update.id', Updates.updateId ?? 'embedded');
  Sentry.setTag('update.channel', Updates.channel ?? 'none');

  return {
    enabled: true,
    capture: (error, context = {}) => {
      Sentry.withScope((scope) => {
        if (context.level) scope.setLevel(context.level);
        if (context.tags) scope.setTags(context.tags);
        Sentry.captureException(error);
      });
    },
    addBreadcrumb: (breadcrumb) => {
      Sentry.addBreadcrumb({
        category: breadcrumb.category,
        message: breadcrumb.message,
        level: breadcrumb.level ?? 'info',
        ...(breadcrumb.data && { data: breadcrumb.data }),
      });
    },
    setUser: (id) => {
      Sentry.setUser(id === null ? null : { id });
    },
  };
}

/** The last line of defense: whatever an event carries is redacted here. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message !== undefined) event.message = redactText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = redactText(exception.value);
  }
  return scrubShared(event);
}

/**
 * A transaction, sent only while performance tracing is on (beforeSend never
 * sees one): scrubbed as an error event is, and its spans too. The SDK strips
 * the query from a request span's name, not from its data: the full URL stays
 * in `url` and `http.url`, the query in `http.query`, and a search carries
 * what the user typed there.
 */
export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  if (event.transaction !== undefined) event.transaction = redactUrlsIn(event.transaction);
  const trace = event.contexts?.trace;
  if (trace?.data) trace.data = scrubData(trace.data);
  if (event.spans) {
    event.spans = event.spans.map((span) => ({
      ...span,
      ...(span.description !== undefined && { description: redactUrlsIn(span.description) }),
      data: scrubData(span.data),
    }));
  }
  return scrubShared(event);
}

/** What error events and transactions both carry. */
function scrubShared<T extends Event>(event: T): T {
  // The request: method and URL without query; no headers, cookies or body.
  if (event.request) {
    event.request = {
      ...(event.request.method !== undefined && { method: event.request.method }),
      ...(event.request.url !== undefined && { url: redactUrl(event.request.url) }),
    };
  }
  // The user: the opaque id only (no email, name or IP address).
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  if (event.extra) event.extra = redact(event.extra);
  if (event.contexts) event.contexts = redact(event.contexts);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((breadcrumb) => scrubBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is SentryBreadcrumb => breadcrumb !== null);
  }
  return event;
}

export function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb | null {
  // Console output can hold anything the app printed: not sent.
  if (breadcrumb.category === 'console') return null;
  const scrubbed: SentryBreadcrumb = { ...breadcrumb };
  if (scrubbed.message !== undefined) scrubbed.message = redactText(scrubbed.message);
  if (scrubbed.data) scrubbed.data = scrubData(scrubbed.data);
  return scrubbed;
}

// The data of breadcrumbs and spans. Request and response bodies never
// travel, nor a query or fragment kept apart from its URL (request spans'
// `http.query`); URLs lose their query strings: requests' `url` and
// `http.url` (`url.full` in OpenTelemetry's names), navigation's `from` and
// `to`.
const DROPPED_KEYS = new Set([
  'body',
  'request_body',
  'response_body',
  'http.query',
  'http.fragment',
  'url.query',
  'url.fragment',
]);
const URL_KEYS = new Set(['url', 'http.url', 'url.full', 'from', 'to']);

function scrubData<T extends Record<string, unknown>>(data: T): T {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (DROPPED_KEYS.has(key)) continue;
    scrubbed[key] = typeof value === 'string' && URL_KEYS.has(key) ? redactUrl(value) : value;
  }
  return redact(scrubbed) as T;
}

// A URL or a path followed by a query or a fragment, inside a name
// ("GET /api/items?q=…"). The repetition before `?` is bounded, so a long
// name cannot stall the app.
const URL_WITH_QUERY = /(?:\b[a-z][a-z0-9+.-]{0,30}:\/\/|\/)[^\s?#]{0,2048}[?#]\S*/gi;

/** A transaction's or a span's name, with every URL in it stripped as redactUrl does. */
function redactUrlsIn(text: string): string {
  return redactText(text.replace(URL_WITH_QUERY, (url) => redactUrl(url)));
}
