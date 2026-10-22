/**
 * Every event the app sends, with its properties: one place to review what
 * is collected (privacy) and a type error for a misspelled event. Properties
 * are enums, counts and ids, never free text or personal data.
 */
export interface AnalyticsEvents {
  onboarding_completed: Record<string, never>;
  sign_in: { method: 'password' };
  sign_out: Record<string, never>;
  sign_up_requested: Record<string, never>;
  sign_up_confirmed: Record<string, never>;
  invitation_accepted: Record<string, never>;
  password_reset_requested: Record<string, never>;
  password_reset: Record<string, never>;
  password_changed: Record<string, never>;
  email_change_requested: Record<string, never>;
  email_change_confirmed: Record<string, never>;
  email_change_reverted: Record<string, never>;
  account_deleted: Record<string, never>;
  invitation_sent: { role: 'member' | 'admin' };
  invitation_revoked: Record<string, never>;
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
