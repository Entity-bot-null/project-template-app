import { env } from '@/config/env';

import { setErrorReporter } from './errorReporter';
import { startSentry } from './sentry';

export {
  addBreadcrumb,
  errorReporter,
  reportError,
  type Breadcrumb,
  type ErrorContext,
  type ErrorReporter,
} from './errorReporter';
export { logger } from './logger';

let started = false;

/**
 * Starts error and crash reporting, once, before the first screen renders
 * (src/app/_layout.tsx). Off without EXPO_PUBLIC_SENTRY_DSN: development,
 * tests and builds of projects that chose no provider.
 */
export function startObservability(): void {
  if (started) return;
  started = true;
  if (env.EXPO_PUBLIC_SENTRY_DSN === undefined) return;
  setErrorReporter(
    startSentry({
      dsn: env.EXPO_PUBLIC_SENTRY_DSN,
      environment: env.EXPO_PUBLIC_APP_ENV,
      tracesSampleRate: env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    }),
  );
}
