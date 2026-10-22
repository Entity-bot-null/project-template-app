// Emails are compared case-insensitively but stored in a case-sensitive
// unique column, so every write and lookup goes through this first.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
