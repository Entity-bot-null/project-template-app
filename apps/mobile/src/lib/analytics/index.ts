import { usePreferences } from '@/store/preferences';

import { consoleProvider, noopProvider } from './providers';
import type { AnalyticsEvents, AnalyticsProvider } from './types';

export type { AnalyticsEvents, AnalyticsProvider } from './types';

// Product analytics behind an interface (docs/mobile-architecture.md#analytics).
// The app calls analytics.track/screen/identify with typed events; the
// provider (Amplitude, PostHog, Firebase, Segment...) is one adapter in
// providers.ts, chosen here. Nothing is sent before the user consents
// (Settings → Privacy), and events carry ids and enums, never personal data.

export interface Analytics {
  track<Name extends keyof AnalyticsEvents>(name: Name, properties: AnalyticsEvents[Name]): void;
  screen(route: string): void;
  identify(userId: string | null): void;
  reset(): void;
}

export function createAnalytics(provider: AnalyticsProvider, hasConsent: () => boolean): Analytics {
  return {
    track: (name, properties) => {
      if (hasConsent()) provider.track(name, properties);
    },
    screen: (route) => {
      if (hasConsent()) provider.screen(route);
    },
    identify: (userId) => {
      if (hasConsent()) provider.identify(userId);
    },
    // Always: forgetting the user needs no consent.
    reset: () => {
      provider.reset();
    },
  };
}

export const analytics = createAnalytics(
  __DEV__ ? consoleProvider : noopProvider,
  () => usePreferences.getState().analyticsConsent === 'granted',
);
