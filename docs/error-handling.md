# Error handling

One shape, one place per side, no leaks.

## API

Every error leaves as `{ "data": null, "message": "..." }` with its HTTP status, plus `errors` on a
400 that names its fields, produced by `AllExceptionsFilter`
(`apps/api/src/common/filters/all-exceptions.filter.ts`). `normalizeException()` turns what was
thrown into the answer:

| Thrown                                                       | Status     | Message sent                                                                |
| ------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------- |
| `ValidationFailedException` (Zod validation, `fieldError()`) | 400        | every field with its path, and `errors`                                     |
| `HttpException` (`NotFoundException`, ...)                   | its status | its message                                                                 |
| Body parser errors (malformed JSON, too large)               | 400 / 413  | `The request body is not valid JSON` / the parser's safe message            |
| Rate limit (`ThrottlerException`)                            | 429        | `Too many requests, retry later`, with `Retry-After`                        |
| Prisma `P2002` unique violation                              | 409        | `A record with this value already exists` (no column names)                 |
| Prisma `P2003` foreign key                                   | 409        | `The record is referenced by another record`                                |
| Prisma `P2025` record not found                              | 404        | `Record not found`                                                          |
| Any other Prisma known error                                 | 500        | `An unexpected error occurred`                                              |
| `ExternalServiceError` (external HTTP client)                | 502 / 504  | `An upstream service failed` / `An upstream service did not answer in time` |
| `RedisUnavailableError` (a feature that fails closed)        | 503        | `Service temporarily unavailable, retry later`                              |
| Anything else                                                | 500        | `An unexpected error occurred`                                              |

Two answers leave before any handler, with the same envelope: 415 for a body that is not JSON
(`apps/api/src/common/http/json-only.middleware.ts`, `Request bodies must be application/json`),
and 426 for an app version below the minimum (`apps/api/src/common/http/app-version.middleware.ts`,
[api-conventions.md](api-conventions.md#minimum-app-version)).

Rules:

- **Throw, do not return errors.** Services throw Nest exceptions with a message written for the
  client developer (English, no internals).
- **Never leak internals.** Stack traces, SQL, file paths, library messages and secrets stay in
  the log. A 5xx is logged with method, path (no query string), status, origin and the request id
  the client received in `X-Request-Id`; 4xx are expected and not logged as errors (the access log
  line of every request has its status).
- **404 over 403 for records the caller may not see** ([authorization.md](authorization.md)).
- **403, not 401, for a wrong current password** on routes that already have a session (change of
  password or email, account deletion): a 401 tells the app its session ended, and it would renew
  the session and send the request again.
- **Fail fast at boot on configuration.** A missing or invalid environment variable stops the
  process with the variable's name (`apps/api/src/env/env.ts`, [environment.md](environment.md)). A
  database that is down does not: the API starts, its readiness answers 503 until the database is
  back, and liveness stays 200, so the orchestrator holds traffic back without restarting it in a
  loop ([database.md](database.md#connections)).
- **Non-JSON bodies** are refused with 415 before any parsing.
- **Errors outside a request** (an uncaught exception, an unhandled rejection) are logged at
  `fatal`, sent to the error tracker, and stop the process, which the orchestrator restarts
  (`apps/api/src/main.ts`, [observability.md](observability.md#error-tracking)).

### Field errors

A 400 that names its fields carries `errors`, one entry per invalid field
(`ValidationFailedException`, `apps/api/src/common/errors/validation-failed.exception.ts`), and its
`message` joins them, for clients that read only that:

```json
{
  "data": null,
  "message": "title: Title is required, description: At most 2000 characters",
  "errors": [
    { "path": "title", "message": "Title is required" },
    { "path": "description", "message": "At most 2000 characters" }
  ]
}
```

- **Validation** (`ZodValidationPipe`, through `@ZodBody` and `@ZodQuery`) names every issue: nested
  fields joined with dots (`items.0.title`), a problem with the whole value (not an object) named by
  its target, `body` or `query`.
- **Services** raise one with `fieldError(path, message)` for what a schema cannot check: the
  password policy (`password`, `newPassword`), a new address equal to the current one (`newEmail`),
  a malformed `Idempotency-Key` header (`Idempotency-Key`).
- Other 400s carry no `errors`: a malformed id in the path (`ParseUUIDPipe`), a body that is not
  valid JSON.
- In the contract: `ErrorResponse.errors`, optional, items `FieldError` (`path`, `message`).

### Server errors

`classifyFailure()` gives every 5xx an origin, the first question of an incident: our code, our
database, or someone else's service.

| Origin        | From                                                                                               | Sent to the error tracker |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------- |
| `database`    | a Prisma error (known, unknown, initialization, engine panic), or a lost connection (driver error) | yes                       |
| `dependency`  | `ExternalServiceError` (with the service's name), `RedisUnavailableError` (`redis`)                | yes                       |
| `unavailable` | a deliberate 5xx other than 500 (readiness 503, a feature this deployment does not offer)          | no                        |
| `application` | anything else, an explicit 500 included                                                            | yes                       |

Every 5xx is logged (`POST /api/items -> 500 (request <id>, database)`, with the stack), counted
(`app.server.errors`, attributes `error.origin` and `http.route`), and, unless it is a deliberate
answer, sent to the error tracker with the request id, method, route pattern (no ids in it), status
and user id ([observability.md](observability.md#error-tracking)).

### Request ids

Every response carries `X-Request-Id`. The app sends a random id with every request (32 hex
characters, `apps/mobile/src/api/http.ts`); the API keeps an incoming id made of
`[A-Za-z0-9._-]`, at most 128 characters, and replaces anything else with a UUID
(`apps/api/src/common/logging/request-context.middleware.ts`), so the header can never inject text
into the logs. The same id is on the API's access log line, on every log line and the trace of the
request, and on its error report; in the app, it is on the `AppError` (`details.requestId`) and on
the breadcrumb of the failed request, which travels with the app's next error report. From an
error report, that id leads to the request's lines in the server's logs.

## App

The app's side is described in [mobile-architecture.md](mobile-architecture.md#errors); this is
what it does with the API's answers.

- **API calls:** `unwrap(call)` and `unwrapWith(call, Schema)` (`apps/mobile/src/api/unwrap.ts`)
  return the envelope's `data`, or throw an `AppError` (`apps/mobile/src/lib/errors.ts`). An error
  status becomes `errorFromResponse()`: the kind from the status (`kindForStatus`: 400 and 422
  `validation`, 401 `unauthenticated`, 403 `forbidden`, 404 `notFound`, 409 `conflict`, 429
  `rateLimited`, 5xx `server`, any other `unknown`), with `details.status`, `details.requestId`,
  `details.serverMessage` (the envelope's `message`) and `details.fieldErrors` (its `errors`). A
  success without the expected body, or `data` that does not match the schema, is a `server` error:
  it never reaches a screen as data. Network failures, timeouts (15 s) and cancellations get kinds
  of their own in `apps/mobile/src/api/http.ts`.
- **User-facing text:** `userMessage(error)` gives one message per kind. The server's `message` is
  for developers and logs (`serverMessage`), never shown as it is. A screen may map a kind it
  expects: sign-in shows "Wrong email or password." for `unauthenticated`.
- **Retries:** queries retry the kinds that may succeed later (`isRetryable`: `network`, `timeout`,
  `rateLimited`, and `server` except 501); mutations are never retried automatically.
- **Session errors:** a 401 to a request that carried the session's token triggers one renewal and
  one replay. A 401 on renewal ends the session, and the sign-in screen says why; a renewal that
  fails on the network or the server keeps the session for the next attempt
  ([mobile-architecture.md](mobile-architecture.md#authentication)).
- **Reporting:** `reportError()` sends the unexpected kinds (`server`, `unknown`) to the error
  tracker and records the expected ones as a breadcrumb, redacted either way.
- **Statuses without a kind:** 413, 415 and 426 arrive as `unknown`, reported as a bug, with
  "Something went wrong. Try again.". The app sends no `X-App-Platform`, so the API never answers
  it 426; the update screen it would need, and its kind, are described in
  [releases.md](releases.md#minimum-supported-version).

### From a field error to a form field

1. The API refuses the request: 400 with
   `errors: [{ "path": "title", "message": "Title is required" }]`.
2. `errorFromResponse()` reads `errors` (checked with a schema: a malformed list is ignored, the
   error keeps its kind) into an `AppError` of kind `validation` with `details.fieldErrors`.
3. The form's submit handler catches it (`toAppError(error)`), keeps the field errors whose `path`
   names one of its fields, and puts each under its field with React Hook Form's
   `setError(path, { message })`. `TextField` shows it under the field in an `AlertText`, which
   screen readers announce, and makes it the input's accessibility hint, so a field the user comes
   back to is read with what is wrong with it.
4. Anything else (no field errors, or none naming a field of the form, such as `body` or
   `Idempotency-Key`) shows `userMessage(error)` in an `AlertText` above the submit button, which
   screen readers announce.

`apps/mobile/src/features/items/NewItemScreen.tsx` is the reference:

```ts
const appError = toAppError(error);
const fields = appError.details.fieldErrors?.filter(
  (field) => field.path === 'title' || field.path === 'description',
);
if (appError.kind === 'validation' && fields?.length) {
  for (const field of fields) {
    setError(field.path as 'title' | 'description', { message: field.message });
  }
} else {
  setFormError(userMessage(appError));
}
```

What follows from it:

- The form's fields and the request's fields share their names (`title`, `description`, `email`,
  `password`, `newPassword`, `newEmail`): renaming one renames the other, in the API's schema, the
  contract and the form.
- A field error's `message` is the one text from the API the app shows as it is, in English: the
  API writes it for the person typing (`Title is required`, `At most 120 characters`), never
  internal. A translated app maps the path to its own text instead
  ([localization.md](localization.md)).
- The form validates on the device first, with its own Zod schema (`NewItemSchema` has the bounds of
  the API's `CreateItemSchema`), for quick feedback; the server's answer is final.
