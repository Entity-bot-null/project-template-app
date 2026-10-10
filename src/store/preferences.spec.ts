import { persistentStorageSync, STORAGE_KEYS } from '@/lib/storage';

import { DEFAULT_PREFERENCES, usePreferences } from './preferences';

beforeEach(() => {
  usePreferences.setState(DEFAULT_PREFERENCES);
});

describe('usePreferences', () => {
  it('persists every change', () => {
    usePreferences.getState().setTheme('dark');
    usePreferences.getState().completeOnboarding();
    usePreferences.getState().setAnalyticsConsent('granted');
    expect(JSON.parse(persistentStorageSync.getItem(STORAGE_KEYS.preferences) ?? '{}')).toEqual({
      state: { theme: 'dark', onboardingCompleted: true, analyticsConsent: 'granted' },
      version: 1,
    });
  });

  it('restores what was stored', async () => {
    persistentStorageSync.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({
        state: { theme: 'light', onboardingCompleted: true, analyticsConsent: 'denied' },
        version: 1,
      }),
    );
    await usePreferences.persist.rehydrate();
    expect(usePreferences.getState()).toMatchObject({
      theme: 'light',
      onboardingCompleted: true,
      analyticsConsent: 'denied',
    });
  });

  it('survives a corrupted file: not even JSON, the defaults stay', async () => {
    persistentStorageSync.setItem(STORAGE_KEYS.preferences, '{"state": {"theme": tru');
    await expect(usePreferences.persist.rehydrate()).resolves.toBeUndefined();
    expect(usePreferences.getState()).toMatchObject(DEFAULT_PREFERENCES);
  });

  it('ignores stored data that does not match, keeping the defaults', async () => {
    persistentStorageSync.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({ state: { theme: 'neon', onboardingCompleted: 'yes' }, version: 1 }),
    );
    await usePreferences.persist.rehydrate();
    expect(usePreferences.getState()).toMatchObject(DEFAULT_PREFERENCES);
  });
});
