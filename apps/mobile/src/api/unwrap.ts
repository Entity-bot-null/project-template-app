import { z } from 'zod';

import { AppError, kindForStatus } from '@/lib/errors';

import { REQUEST_ID_HEADER } from './http';

// Turns a typed API call (openapi-fetch) into the data of its envelope, or
// throws an AppError. Every response of the API is { data, message }; errors
// add `errors` with one entry per invalid field. Responses that drive the
// app's security or its data model (tokens, the user) are also checked
// against a schema: TypeScript types do not validate what comes from the
// network.

interface ApiResult<D> {
  data?: D;
  error?: unknown;
  response: Response;
}

const ErrorBodySchema = z.object({
  message: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

/** The AppError for a response that is not a success. */
export function errorFromResponse(response: Response, body: unknown): AppError {
  const parsed = ErrorBodySchema.safeParse(body);
  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const serverMessage = parsed.success ? parsed.data.message : undefined;
  return new AppError(
    kindForStatus(response.status),
    `HTTP ${response.status}${serverMessage === undefined ? '' : `: ${serverMessage}`}`,
    {
      status: response.status,
      ...(requestId !== undefined && { requestId }),
      ...(serverMessage !== undefined && { serverMessage }),
      ...(parsed.success && parsed.data.errors && { fieldErrors: parsed.data.errors }),
    },
  );
}

/** The `data` of a successful envelope; throws an AppError otherwise. */
export async function unwrap<D extends { data: unknown }>(
  call: Promise<ApiResult<D>>,
): Promise<D['data']> {
  const { data, error, response } = await call;
  if (!response.ok) throw errorFromResponse(response, error);
  if (data === undefined) {
    throw new AppError('server', `HTTP ${response.status} without the expected body`, {
      status: response.status,
    });
  }
  return data.data;
}

/** Like unwrap(), and the data must match `schema` (a contract violation is a server error). */
export async function unwrapWith<D extends { data: unknown }, S extends z.ZodType>(
  call: Promise<ApiResult<D>>,
  schema: S,
): Promise<z.infer<S>> {
  const data = await unwrap(call);
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('server', 'The response does not match the contract', {
      cause: result.error,
    });
  }
  return result.data;
}
