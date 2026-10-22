import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SchemaObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { errorResponse } from '../common/openapi/api.decorators.js';
import {
  ERROR_RESPONSE_SCHEMA_NAME,
  errorResponseSchema,
  FIELD_ERROR_SCHEMA_NAME,
  fieldErrorSchema,
  schemaComponents,
} from '../common/openapi/zod-schema.js';
import { APP_VERSION_EXEMPT_PREFIXES } from '../common/http/app-version.middleware.js';

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };

// The committed contract, openapi/openapi.json at the repository root.
// Resolved from this module (src/ and dist/ sit at the same depth), so the
// export and the drift spec read the same file whatever the working directory.
export const OPENAPI_JSON_PATH = fileURLToPath(
  new URL('../../../../openapi/openapi.json', import.meta.url),
);

// Path parameters named `id` or `<name>Id` are UUIDs (ParseUUIDPipe).
const UUID_PARAM = /^(id|[a-z][A-Za-z]*Id)$/;
// Routes exempt from rate limiting (@SkipThrottle) never answer 429.
const UNTHROTTLED_PREFIXES = ['/api/health/'];

// Builds the document from the running Nest app: routes and parameters from
// the controllers, bodies and payloads from the Zod schemas through @ZodBody,
// @ZodQuery and @ApiData. The export script, the drift spec and the dev
// Swagger UI all call this, so they always agree.
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API')
    .setVersion(version)
    .setDescription(
      'REST API under /api for the mobile app. Every response body is { data, message }; errors carry data: null, and a 400 that names its fields lists them in errors. Authenticated routes take the access token of a session (POST /api/auth/sign-in) as a bearer token; POST /api/auth/refresh exchanges the refresh token for a new session. The app sends X-App-Platform (ios, android) and X-App-Version with every request: below the oldest version the API serves, it answers 426.',
    )
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas ??= {};
  annotateOperations(document);
  document.components.schemas = {
    [ERROR_RESPONSE_SCHEMA_NAME]: errorResponseSchema,
    [FIELD_ERROR_SCHEMA_NAME]: fieldErrorSchema,
    ...referencedComponents(document.paths, schemaComponents()),
  };
  return document;
}

/** The named schemas the routes refer to, and the ones those refer to, by name. */
function referencedComponents(
  paths: OpenAPIObject['paths'],
  named: Record<string, SchemaObject>,
): Record<string, SchemaObject> {
  const found: Record<string, SchemaObject> = {};
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const id = value.replace(/^#\/components\/schemas\//, '');
        const schema = named[id];
        if (schema !== undefined && !(id in found)) {
          found[id] = schema;
          visit(schema);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(paths);
  return Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

// Facts no single controller owns: UUID path parameters, the global rate
// limiter and the minimum app version.
function annotateOperations(document: OpenAPIObject): void {
  const rateLimited = errorResponse(429);
  const upgradeRequired = errorResponse(426);
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined) continue;
      for (const param of operation.parameters ?? []) {
        if ('in' in param && param.in === 'path' && UUID_PARAM.test(param.name)) {
          if (param.schema && 'type' in param.schema) param.schema.format = 'uuid';
        }
      }
      if (!UNTHROTTLED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        operation.responses[String(rateLimited.status)] = response(rateLimited);
      }
      if (!APP_VERSION_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        operation.responses[String(upgradeRequired.status)] = response(upgradeRequired);
      }
    }
  }
}

function response({ description, schema }: ReturnType<typeof errorResponse>) {
  return { description, content: { 'application/json': { schema } } };
}
