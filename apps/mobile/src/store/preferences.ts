import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistentStorageSync, STORAGE_KEYS } from '@/lib/storage';

// Client state that outlives a session (docs/MOBILE_ARCHITECTURE.md#state): the
// device's preferences. Zustand, persisted in the SQLite key-value store and
// read synchronously, so the first frame already has the right theme and
// knows whether onboarding is done. Server data never goes here: TanStack
// Query owns it.

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';

const PersistedSchema = z.object({
  theme: z.enum(THEME_PREFERENCES),
  onboardingCompleted: z.boolean(),
  analyticsConsent: z.enum(['unknown', 'granted', 'denied']),
});

type Persisted = z.infer<typeof PersistedSchema>;

interface PreferencesState extends Persisted {
  setTheme: (theme: ThemePreference) => void;
  completeOnboarding: () => void;
  setAnalyticsConsent: (consent: 'granted' | 'denied') => void;
}

export const DEFAULT_PREFERENCES: Persisted = {
  theme: 'system',
  onboardingCompleted: false,
  analyticsConsent: 'unknown',
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      setTheme: (theme) => {
        set({ theme });
      },
      completeOnboarding: () => {
        set({ onboardingCompleted: true });
      },
      setAnalyticsConsent: (analyticsConsent) => {
        set({ analyticsConsent });
      },
    }),
    {
      name: STORAGE_KEYS.preferences,
      version: 1,
      storage: createJSONStorage(() => persistentStorageSync),
      partialize: ({ theme, onboardingCompleted, analyticsConsent }) => ({
        theme,
        onboardingCompleted,
        analyticsConsent,
      }),
      // Stored data is external input: what does not match is replaced by
      // the defaults, never trusted.
      merge: (persisted, current) => {
        const result = PersistedSchema.safeParse(persisted);
        return result.success ? { ...current, ...result.data } : current;
      },
    },
  ),
);
