import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

// Bridges the Zod schemas (the single source of truth for request and
// response shapes) to the OpenAPI document. Zod emits JSON Schema natively;
// the OpenAPI 3.0 target keeps `nullable` and avoids 2020-12-only keywords so
// every generator reads it the same way. `input` documents what a client may
// send (defaults optional), `output` what it receives (defaults applied).
//
// A schema with a name (`.meta({ id: 'Item' })`) becomes a component of the
// document, referenced wherever it appears (#/components/schemas/Item): the
// app's generated types call it by that name. Name the resources a client
// works with, not every body.
export function zodToOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'input'): SchemaObject {
  const {
    $schema: _,
    definitions,
    ...json
  } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  for (const [id, definition] of Object.entries(definitions ?? {})) {
    registerComponent(id, componentRefs(stripFormatPatterns(definition)) as SchemaObject);
  }
  return componentRefs(stripFormatPatterns(json)) as SchemaObject;
}

/** Every variant seen of each named schema, as JSON (one, unless input and output differ). */
const components = new Map<string, Map<string, SchemaObject>>();

function registerComponent(id: string, schema: SchemaObject): void {
  const variants = components.get(id) ?? new Map<string, SchemaObject>();
  variants.set(JSON.stringify(schema), schema);
  components.set(id, variants);
}

/**
 * The named schemas, as the document's components. Read when the document
 * is built, not when the decorators run: a name given to two different
 * schemas (or to one whose input and output differ, defaults for instance)
 * fails the build and the contract spec, never the API's boot.
 */
export function schemaComponents(): Record<string, SchemaObject> {
  const out: Record<string, SchemaObject> = {};
  for (const [id, variants] of components) {
    const [first, ...others] = variants.values();
    if (first === undefined) continue;
    if (others.length > 0) {
      throw new Error(
        `Two different schemas are named "${id}" (an input and an output that differ?): give each its own id`,
      );
    }
    out[id] = first;
  }
  return out;
}

/** Zod points at its own `definitions`; the document keeps them as components. */
function componentRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(componentRefs);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] =
      key === '$ref' && typeof value === 'string'
        ? value.replace(/^#\/definitions\//, '#/components/schemas/')
        : componentRefs(value);
  }
  return out;
}

// Zod backs `format: email|uuid|date-time|date` with a long regex `pattern`,
// and bounds integers with the JS safe range. The format alone is the
// contract (what readers and generators use) and the range says nothing
// about the API, so both are dropped. A custom regex on its own is kept: it
// is part of the contract.
const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const ZOD_FORMAT_PATTERNS = new Map<string, string>([
  [z.regexes.email.source, 'email'],
  [z.regexes.uuid().source, 'uuid'],
  [z.regexes.datetime({}).source, 'date-time'],
  [z.regexes.date.source, 'date'],
]);

function stripFormatPatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripFormatPatterns);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'pattern' && typeof value === 'string') {
      const format = ZOD_FORMAT_PATTERNS.get(value);
      if (format !== undefined) {
        out.format ??= format;
        continue;
      }
      if ('format' in node) continue;
    }
    if (key === 'maximum' && value === SAFE_INTEGER) continue;
    if (key === 'minimum' && value === -SAFE_INTEGER) continue;
    out[key] = stripFormatPatterns(value);
  }
  return out;
}

/** Every successful response is wrapped by TransformInterceptor. */
export function envelope(data: SchemaObject): SchemaObject {
  return {
    type: 'object',
    required: ['data', 'message'],
    properties: { data, message: { type: 'string' } },
  };
}

export const ERROR_RESPONSE_SCHEMA_NAME = 'ErrorResponse';
export const FIELD_ERROR_SCHEMA_NAME = 'FieldError';

/** One invalid field of a request (common/errors/validation-failed.exception.ts). */
export const fieldErrorSchema: SchemaObject = {
  type: 'object',
  required: ['path', 'message'],
  properties: {
    path: {
      type: 'string',
      description: 'The field, as the request named it (nested fields joined with dots).',
    },
    message: { type: 'string', description: 'What is wrong with it.' },
  },
};

/** Errors are normalized by AllExceptionsFilter: data is always null. */
export const errorResponseSchema: SchemaObject = {
  type: 'object',
  required: ['data', 'message'],
  properties: {
    // OpenAPI 3.0 has no null type: a nullable enum of null is the idiom
    // generators read as exactly `null`.
    data: { nullable: true, enum: [null] },
    message: { type: 'string' },
    errors: {
      type: 'array',
      description:
        'On a 400 that names its fields: one entry per invalid field, for the client to mark each one.',
      items: { $ref: `#/components/schemas/${FIELD_ERROR_SCHEMA_NAME}` },
    },
  },
};
