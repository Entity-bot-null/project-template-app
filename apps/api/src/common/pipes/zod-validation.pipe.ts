import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import {
  type FieldError,
  ValidationFailedException,
} from '../errors/validation-failed.exception.js';

export type ValidationTarget = 'body' | 'query';

// Validates one argument type against a Zod schema and hands the parsed value
// (defaults applied, unknown keys stripped) to the handler. Used through
// @ZodBody and @ZodQuery, which also document the schema in OpenAPI. A
// refusal names every invalid field (`errors`, docs/error-handling.md); one
// about the whole value (not an object) names the target itself.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: z.ZodType,
    private readonly target: ValidationTarget = 'body',
  ) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== this.target) return value;
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedException(
        result.error.issues.map((issue): FieldError => ({
          path: issue.path.map(String).join('.') || this.target,
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
