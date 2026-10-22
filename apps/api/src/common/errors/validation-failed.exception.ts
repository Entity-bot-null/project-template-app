import { BadRequestException } from '@nestjs/common';

/** One invalid field of a request: where it is, and what is wrong with it. */
export interface FieldError {
  /** The field as the request named it, nested fields joined with dots ("items.0.title"). */
  path: string;
  message: string;
}

// A 400 that names the fields at fault (docs/error-handling.md): the error
// envelope carries them as `errors`, which the app reads to mark each field
// (FieldError in the contract); `message` joins them, for clients that read
// only it.
export class ValidationFailedException extends BadRequestException {
  readonly errors: readonly FieldError[];

  constructor(errors: readonly FieldError[]) {
    super(errors.map(({ path, message }) => `${path}: ${message}`).join(', '));
    this.errors = errors;
  }
}

/** A 400 about one field. */
export function fieldError(path: string, message: string): ValidationFailedException {
  return new ValidationFailedException([{ path, message }]);
}
