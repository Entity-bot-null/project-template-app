import * as Sentry from '@sentry/react-native';
import type { Breadcrumb as SentryBreadcrumb, ErrorEvent } from '@sentry/react-native';
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

const URL_KEYS = new Set(['url', 'from', 'to']);

export function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb | null {
  // Console output can hold anything the app printed: not sent.
  if (breadcrumb.category === 'console') return null;
  const scrubbed: SentryBreadcrumb = { ...breadcrumb };
  if (scrubbed.message !== undefined) scrubbed.message = redactText(scrubbed.message);
  if (scrubbed.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scrubbed.data)) {
      // Request and response bodies never travel.
      if (key === 'body' || key === 'request_body' || key === 'response_body') continue;
      data[key] = typeof value === 'string' && URL_KEYS.has(key) ? redactUrl(value) : value;
    }
    scrubbed.data = redact(data);
  }
  return scrubbed;
}
