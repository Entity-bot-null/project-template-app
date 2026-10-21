import { logger } from '@/lib/observability';

import type { AnalyticsProvider } from './types';

/** Production default until a provider is chosen: nothing leaves the device. */
export const noopProvider: AnalyticsProvider = {
  track: () => undefined,
  screen: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
};

/** Development: events in the Metro console, to check what would be sent. */
export const consoleProvider: AnalyticsProvider = {
  track: (name) => {
    logger.info('app', `analytics: ${name}`);
  },
  screen: (route) => {
    logger.info('navigation', `analytics screen: ${route}`);
  },
  identify: (userId) => {
    logger.info('app', `analytics identify: ${userId === null ? 'anonymous' : 'user'}`);
  },
  reset: () => {
    logger.info('app', 'analytics reset');
  },
};
