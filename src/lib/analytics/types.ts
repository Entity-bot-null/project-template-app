/**
 * Every event the app sends, with its properties: one place to review what
 * is collected (privacy) and a type error for a misspelled event. Properties
 * are enums, counts and ids, never free text or personal data.
 */
export interface AnalyticsEvents {
  onboarding_completed: Record<string, never>;
  sign_in: { method: 'password' };
  sign_out: Record<string, never>;
  item_created: Record<string, never>;
  theme_changed: { theme: 'system' | 'light' | 'dark' };
}

/** What a provider adapter implements. */
export interface AnalyticsProvider {
  track(name: string, properties: object): void;
  screen(route: string): void;
  identify(userId: string | null): void;
  reset(): void;
}
