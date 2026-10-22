import { z } from 'zod';

// The fields of the forms that take a password. A new one follows the API's
// rules (docs/security.md#passwords): its length is checked here, so the user
// hears at once; the server has the last word, and also refuses passwords
// that are common, predictable or contain the account's email or name, with
// its message under the field.

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 200;
/** What the API accepts as typed: up to two UTF-16 units per character. */
const PASSWORD_MAX_INPUT = 400;

/** Characters as the API counts them: Unicode code points after NFKC (an emoji is one). */
function characters(password: string): number {
  return Array.from(password.normalize('NFKC')).length;
}

/** A password the account already has (sign-in, confirmations): never checked against the rules. */
export const currentPassword = z
  .string()
  .min(1, 'Enter your password')
  .max(PASSWORD_MAX_INPUT, `At most ${String(PASSWORD_MAX_INPUT)} characters`);

/** A password being chosen. */
export const newPassword = z
  .string()
  // One message at a time: an empty or oversized value is not counted.
  .min(1, { message: 'Choose a password', abort: true })
  .max(PASSWORD_MAX_INPUT, {
    message: `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`,
    abort: true,
  })
  .refine((value) => characters(value) >= PASSWORD_MIN_LENGTH, {
    message: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
  })
  .refine((value) => characters(value) <= PASSWORD_MAX_LENGTH, {
    message: `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`,
  });

/**
 * The new password typed twice (in `field` and `repeatPassword`): a typo
 * would lock the user out of the account.
 */
export function withRepeatedPassword<
  K extends string,
  S extends z.ZodType<Record<K, string> & { repeatPassword: string }>,
>(schema: S, field: K): S {
  return schema.refine((values) => values[field] === values.repeatPassword, {
    path: ['repeatPassword'],
    message: 'The passwords do not match',
  });
}

export const PASSWORD_HINT = `At least ${String(PASSWORD_MIN_LENGTH)} characters. A few unrelated words make a strong one.`;
