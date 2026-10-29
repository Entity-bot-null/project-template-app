import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';

import type { AppError } from './errors';

// Server errors in a form (docs/mobile-architecture.md#forms): a 400 that
// names its fields puts each message under its field; anything else is said
// once for the whole form, in the user's words (userMessage()).

export const NUL_REFUSED = 'Contains a character that cannot be saved';

/**
 * Typed text the API keeps (a title, a name), trimmed. A NUL (U+0000) is
 * refused, as the API refuses it (PostgreSQL text cannot hold one): no
 * keyboard types it, but a paste can bring it, and it is said under the
 * field before anything is sent. The caller adds the bounds.
 */
export function freeText() {
  return z
    .string()
    .trim()
    .refine((value) => !value.includes('\u0000'), NUL_REFUSED);
}

/**
 * Shows the server's field errors under the form's own fields. True when at
 * least one landed; false otherwise (another kind of error, or only fields
 * the form does not have), and the caller says it for the whole form.
 */
export function showFieldErrors<T extends FieldValues>(
  error: AppError,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): boolean {
  if (error.kind !== 'validation') return false;
  const known = (error.details.fieldErrors ?? []).filter((field) =>
    (fields as readonly string[]).includes(field.path),
  );
  for (const field of known) setError(field.path as Path<T>, { message: field.message });
  return known.length > 0;
}
