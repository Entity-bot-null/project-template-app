import { isExpected, toAppError } from '../errors';
import { redact } from './redact';

// Error and crash reporting behind an interface (docs/MOBILE_ARCHITECTURE.md#observability).
// The app reports through reportError() and addBreadcrumb(); the provider
// (Sentry, sentry.ts) is chosen once at startup and can be swapped without
// touching feature code. Without a DSN nothing is sent anywhere.

export type Severity = 'fatal' | 'error' | 'warning';

export interface ErrorContext {
  level?: Severity;
  /** Low-cardinality facts (feature, screen, error kind): never personal data. */
  tags?: Record<string, string | number | boolean>;
}

export interface Breadcrumb {
  category: 'navigation' | 'network' | 'auth' | 'ui' | 'app';
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, string | number | boolean | null>;
}

export interface ErrorReporter {
  readonly enabled: boolean;
  capture(error: unknown, context?: ErrorContext): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
  /** An opaque user id (never an email or a name); null on sign-out. */
  setUser(id: string | null): void;
}

export const disabledReporter: ErrorReporter = {
  enabled: false,
  capture: () => undefined,
  addBreadcrumb: () => undefined,
  setUser: () => undefined,
};

let current: ErrorReporter = disabledReporter;

export function errorReporter(): ErrorReporter {
  return current;
}

export function setErrorReporter(reporter: ErrorReporter): void {
  current = reporter;
}

/**
 * Reports an error that the app did not expect (a bug, a server failure).
 * Expected ones (offline, validation, an ended session) become a breadcrumb:
 * context for the next real error, not an issue of their own.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const appError = toAppError(error);
  if (__DEV__) console.error(redact(appError));
  if (isExpected(appError)) {
    current.addBreadcrumb({
      category: 'app',
      level: 'warning',
      message: `${appError.kind} error`,
      data: { status: appError.details.status ?? null },
    });
    return;
  }
  current.capture(error, {
    ...context,
    tags: {
      'error.kind': appError.kind,
      ...(appError.details.status !== undefined && { 'http.status': appError.details.status }),
      ...context.tags,
    },
  });
}

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  current.addBreadcrumb(breadcrumb);
}
