import { z } from 'zod';

// Text people type (a title, a description, a name, a search) is stored in,
// or compared with, PostgreSQL text, which cannot hold U+0000 (NUL): one would
// reach the database and fail there, a 500 reported as a database failure.
// Refused at the boundary instead, as any other invalid value: a 400 naming
// the field (docs/error-handling.md). Every other character goes through as
// typed.

export const NUL_REFUSED = 'Contains a character that is not allowed';

/** Trimmed typed text with no NUL in it; the caller adds its bounds. */
export function freeText() {
  return z
    .string()
    .trim()
    .refine((value) => !value.includes('\u0000'), NUL_REFUSED);
}
