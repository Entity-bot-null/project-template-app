import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';

import { analytics, createAnalytics } from './index';
import { consoleProvider, noopProvider } from './providers';
import type { AnalyticsProvider } from './types';

function fakeProvider(): jest.Mocked<AnalyticsProvider> {
  return { track: jest.fn(), screen: jest.fn(), identify: jest.fn(), reset: jest.fn() };
}

describe('analytics', () => {
  it('sends nothing without consent, except forgetting the user', () => {
    const provider = fakeProvider();
    const tracker = createAnalytics(provider, () => false);
    tracker.track('sign_in', { method: 'password' });
    tracker.screen('/items');
    tracker.identify('user-1');
    tracker.reset();
    expect(provider.track).not.toHaveBeenCalled();
    expect(provider.screen).not.toHaveBeenCalled();
    expect(provider.identify).not.toHaveBeenCalled();
    expect(provider.reset).toHaveBeenCalled();
  });

  it('sends typed events once the user consented', () => {
    const provider = fakeProvider();
    const tracker = createAnalytics(provider, () => true);
    tracker.track('theme_changed', { theme: 'dark' });
    tracker.screen('/items/[id]');
    tracker.identify('user-1');
    expect(provider.track).toHaveBeenCalledWith('theme_changed', { theme: 'dark' });
    expect(provider.screen).toHaveBeenCalledWith('/items/[id]');
    expect(provider.identify).toHaveBeenCalledWith('user-1');
  });

  it('reads consent from the preferences', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    usePreferences.setState({ ...DEFAULT_PREFERENCES, analyticsConsent: 'granted' });
    analytics.track('item_created', {});
    expect(log).toHaveBeenCalledWith('[app] analytics: item_created', '');
    usePreferences.setState(DEFAULT_PREFERENCES);
  });

  it('ships two providers: console for development, nothing for production', () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const provider of [consoleProvider, noopProvider]) {
      expect(() => {
        provider.track('x', {});
        provider.screen('/');
        provider.identify(null);
        provider.identify('u');
        provider.reset();
      }).not.toThrow();
    }
  });
});
