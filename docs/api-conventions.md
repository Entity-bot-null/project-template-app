# API conventions

REST over JSON, everything under `/api`, for one client: the mobile app (`apps/mobile`). The
contract is `openapi/openapi.json`, which the API generates from its controllers and Zod schemas
(see [openapi/README.md](../openapi/README.md) for the workflow, and [The contract](#the-contract)
below).

## Shape of every response

```json
{ "data": <payload or null>, "message": "Operation successful" }
```

- Controllers return plain values; `TransformInterceptor`
  (`apps/api/src/common/interceptors/transform.interceptor.ts`) wraps them. Return
  `{ data, message }` yourself only to choose the message (`'Signed in'`, `'Item created'`).
- Errors use the same envelope with `data: null` and the HTTP status; a 400 that names its fields
  adds `errors: [{ path, message }]` ([error-handling.md](error-handling.md)).
- `204 No Content` has no body.
- Every response carries `X-Request-Id`. The app sends its own id with every request, and the API
  keeps it when it is valid (`[A-Za-z0-9._-]`, at most 128 characters; a UUID otherwise). Quote it
  in bug reports: the app keeps it on its errors (`AppError.details.requestId`).
- Every response carries `Cache-Control: no-store` (`apps/api/src/app.setup.ts`): responses hold
  tokens and personal data. A route whose answer is public and the same for everyone may set its own
  caching header, in review.

## Routes

| Rule                       | Example                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plural nouns, kebab-case   | `/api/users`, `/api/auth/password-resets`                                                                                                             |
| Nest by ownership only     | `/api/projects/:projectId/tasks` (not deeper than one level)                                                                                          |
| Actions as sub-resources   | `POST /api/auth/sign-in`, `POST /api/auth/invitations/accept`, `POST /api/account/deletion`                                                           |
| `/api/auth/` is anonymous  | sign-in and its session, emailed links; the app calls it through `publicApi`, which sends no token (`apps/api/src/openapi/openapi.spec.ts` checks it) |
| ids are UUIDs              | `@Param('id', ParseUUIDPipe)`; params named `id`/`…Id` are documented as `uuid`                                                                       |
| `camelCase` JSON fields    | `createdAt`, `accessToken`                                                                                                                            |
| Timestamps in ISO 8601 UTC | `2026-01-31T12:00:00.000Z`                                                                                                                            |
| Public routes              | under `/api/auth/` (sessions, account links, capabilities) or `/api/health/` (probes) only                                                            |

## Methods and status codes

| Method   | Use                            | Success                                                                                                                                                                                                                 |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | read, never changes state      | `200`                                                                                                                                                                                                                   |
| `POST`   | create, or run an action       | `201` (create), `200` (an action with a result: sign-in, password change), `202` (accepted, the outcome follows by email: sign-up, change of email), `204` (an action with nothing to return: logout, account deletion) |
| `PATCH`  | partial update                 | `200` with the updated record                                                                                                                                                                                           |
| `PUT`    | full replacement (rarely used) | `200`                                                                                                                                                                                                                   |
| `DELETE` | delete, idempotent             | `204` (`DELETE /api/admin/invitations/{id}`)                                                                                                                                                                            |

Errors:

| Status      | Meaning                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`       | validation failed (body, query, path parameter or header); `errors` names the fields                                                                                            |
| `401`       | not authenticated: a missing, invalid or expired access token, or a refresh token that no longer works                                                                          |
| `403`       | not allowed: a role, a wrong current password on a route that already has a session, a browser request from another site, a feature closed here (public sign-up)                |
| `404`       | not found, also for records the caller may not see ([authorization.md](authorization.md))                                                                                       |
| `409`       | conflict with the current state: the password changed meanwhile, the only administrator, an address that has an account, a create with the same `Idempotency-Key` still running |
| `413`       | body too large (over 100 kB)                                                                                                                                                    |
| `415`       | a body that is not `application/json`                                                                                                                                           |
| `422`       | well-formed but not processable as sent: an `Idempotency-Key` already used with another body                                                                                    |
| `426`       | this app version is no longer supported ([Minimum app version](#minimum-app-version))                                                                                           |
| `429`       | rate limit, with `Retry-After` in seconds ([security.md](security.md#rate-limiting))                                                                                            |
| `502`/`504` | an external service failed or did not answer in time                                                                                                                            |
| `503`       | a dependency is down, or this deployment does not offer the feature (no email configured)                                                                                       |

A wrong current password answers 403, not 401: the session itself is fine, and a 401 would make the
app renew its session and send the request again.

Document each route's errors with `@ApiErrors(...)`. It takes the statuses that have a description
in `ERROR_DESCRIPTIONS` (`apps/api/src/common/openapi/api.decorators.ts`: 400, 401, 403, 404, 409,
422, 426, 429, 503) and throws on any other when the module loads: add the description there first.
`@Auth()` documents 401, and 403 when it names roles; the document builder
(`apps/api/src/openapi/openapi.ts`) adds 429 and 426 to every route but the health probes. 413, 415,
502 and 504 can reach any route and are not listed per route.

## Validation

- Bodies: `@ZodBody(Schema)` with a bare `@Body()`. Queries: `@ZodQuery(z.object(...))` with a bare
  `@Query()`; numeric query fields use `z.coerce.number()`. The same schema validates the request
  and documents it in the contract, so the two cannot drift apart.
- Unknown keys are stripped, defaults applied; the handler receives the parsed value.
- Bound everything: string `max`, array `max`, numeric ranges. The request body limit is 100 kB
  (Express default) unless a route needs more.
- Text people type (a title, a description, a name, a search) is `freeText()`
  (`apps/api/src/common/free-text.ts`) with its bounds: trimmed, and a NUL (U+0000), which
  PostgreSQL text cannot hold, is a field error instead of a database failure (a 500). The app's
  forms use their own `freeText()` (`apps/mobile/src/lib/forms.ts`), and the mock API refuses it
  too.
- Bodies are JSON only (`Content-Type: application/json`); anything else answers 415. A route that
  must take another type (a file upload) is exempted explicitly in
  `apps/api/src/common/http/json-only.middleware.ts`, in review.
- A refusal names every problem with its path, in `errors` and joined in `message`:
  `title: Title is required, description: At most 2000 characters`. Nested paths are joined with
  dots (`items.0.title`); a problem with the whole value (not an object) is named by its target
  (`body`, `query`).
- Checks a schema cannot make answer the same way, through `fieldError(path, message)`
  (`apps/api/src/common/errors/validation-failed.exception.ts`): the password policy (`password`,
  `newPassword`), a new address equal to the current one (`newEmail`), a malformed
  `Idempotency-Key` header (`Idempotency-Key`).
- The app shows a field's `message` as it is, under that field
  ([error-handling.md](error-handling.md#from-a-field-error-to-a-form-field)): write it for the
  person typing, short and plain, never internal.

## Responses (output validation)

- Response shapes are Zod schemas in `dto/*.schemas.ts`, documented with `@ApiData(Schema)`. The
  app checks what it reads against its own schemas (`unwrapWith`), which `satisfies` the generated
  types.
- Select columns explicitly (`USER_SELECT`, `ITEM_SELECT`) and map the row to the response
  (`toResponse` in `apps/api/src/items/items.service.ts`): a new database column stays private until
  added to the select and the schema. Never return a whole Prisma model.
- An optional value that is not there is left out, not sent as `null` (`Item.description`), as its
  schema's `.optional()` says.

## The contract

`pnpm contract` (`pnpm --filter api openapi:export && pnpm --filter mobile api:types`) writes
`openapi/openapi.json` from the running Nest application, then `apps/mobile/src/api/schema.d.ts`
from it; commit both. The export builds the API and creates the application without initializing
it: it opens no database connection, but needs a valid environment (`apps/api/.env`). Drift fails
two checks: `apps/api/src/openapi/openapi.spec.ts` (the document the controllers produce against the
committed file, in `pnpm test` and CI's unit job) and `api-types.mjs --check` (the generated types
against the file, in `pnpm typecheck`).

- **Named schemas.** A Zod schema with `.meta({ id: 'Item' })` becomes `#/components/schemas/Item`,
  referenced wherever it appears (`apps/api/src/common/openapi/zod-schema.ts`); the app's generated
  types call it by that name (`components['schemas']['Item']`). Name the resources a client works
  with, not every body. The names today: `User`, `UserPage`, `SessionUser`, `Session`,
  `Capabilities`, `Item`, `ItemPage`, `CreateItemRequest`, `Invitation`, `InvitationPage`, and the
  error envelope's `ErrorResponse` and `FieldError`.
- **One name, one schema.** A name given to two different schemas, or to one whose input and output
  differ (a default, for instance), fails the document build and its spec, never the API's boot:
  give each its own id.
- **The contract spec** also requires the bearer requirement on every route outside `/api/auth/`
  and `/api/health/`, a documented success on every route, and 429 and 426 everywhere but the
  probes.
- **The mock API.** `apps/mobile/scripts/mock-api.mjs` implements the same contract in memory, for
  working without a backend and for the faults the Maestro flows inject.
  `apps/mobile/scripts/mock-api.test.mjs` (`pnpm test:scripts`) fails when it serves a route or a
  method the contract does not have, answers a status the contract does not declare for the route,
  or sends a body that breaks the contract's schema: a contract change updates the mock too.

## Pagination

List routes take `limit` (1 to 100, default 20) and `offset` (default 0) through `PageQuerySchema`
(`apps/api/src/common/pagination.ts`) and answer `{ items, total }` (`pageOf(ItemSchema)`); a value
out of range is a 400. Order by a unique key last so pages never overlap
(`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`), with an index in that order
(`items_owner_id_created_at_id_idx`). The total uses the same filter as the page, in the same
transaction. A route's own filters extend the schema: `GET /api/items` adds `q` (titles that contain
it, whatever the letter case, at most 100 characters; `%` and `_` are characters to find, not
patterns). The app asks for the next page with `offset` set to the items it has loaded, until it
reaches `total` (`useItems` in `apps/mobile/src/features/items/api.ts`). Pages never overlap while
the collection stays as it is; a row created meanwhile (on another device) moves every row down
one, so the next page starts with one already listed, and `useItems` shows each item once. For very
large or fast-moving collections, switch that route to cursor pagination (OPCIONAL).

## Idempotency

`POST /api/items` takes an optional `Idempotency-Key` header, so that a create retried after its
answer was lost (a dropped connection, a timeout) gets the first item back instead of making a
second one:

- The client generates a key for one create (a UUID) and keeps it across that create's retries: 1 to
  255 visible ASCII characters. Anything else is a 400 whose `errors` names `Idempotency-Key`.
- **Same key, same body:** the first item, `201` again. The body is compared as validated (title and
  description trimmed), through a SHA-256 of it.
- **Same key, another body:** `422`,
  `This Idempotency-Key was used for a different request: use a new key`.
- **A request with the key still being processed:** `409`,
  `A request with this Idempotency-Key is still being processed: retry it later`. A request that
  fails gives its key back, so the retry after it creates the item.
- Keys are per user: the same key from another account is a key of its own.
- Without the header, every request creates an item.

How it holds (`apps/api/src/items/items.service.ts`):

- **The guarantee is in the database.** The key and the body's hash are stored on the item, under a
  unique index on `(owner_id, idempotency_key)` (migration `20261021190100_add_items`): one item per
  key and owner, whatever the instances or the cache do. A create that loses the race to another
  with the same key (a unique violation) answers with the winner's item. The key is remembered as
  long as the item exists.
- **The 409 comes from a claim on the key** (`IdempotencyService`, scope `items:create`, the key
  hashed with its owner): held for 60 seconds while the create runs, then marked done for 24 hours.
  With `REDIS_URL` the claim is shared by every instance; without it, it holds within one process
  ([architecture.md](architecture.md#locks-and-idempotency)).
- **Without Redis when it is configured** (unreachable), the claim is skipped and counted
  (`app.degraded.operations`, feature `items-idempotency`): the database key alone keeps the create
  single, and a concurrent retry waits for the first request instead of getting 409.

The app's create (`useCreateItem`) sends no key: its mutations are never retried automatically
(`apps/mobile/src/lib/query/queryClient.ts`). A client that retries a create sends one. Another
create that may be retried follows the same pattern: the key and the hash on the row under a unique
constraint first, the claim second.

## Authentication and authorization

Every route is protected with `@Auth()` (any signed-in user) or `@Auth('admin', ...)` unless it is
deliberately public (under `/api/auth/` and `/api/health/`; the contract spec fails on any other
route without the bearer requirement). The access token travels as `Authorization: Bearer <token>`;
the refresh token travels in the body of `POST /api/auth/refresh` and `POST /api/auth/logout`, never
in a header or a cookie
([adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md](adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md)).
Object-level checks live in the service: see [authorization.md](authorization.md). Every route,
public ones included, also passes the global Fetch Metadata guard: a request a browser makes for a
page on another origin is refused with 403 unless that origin is in `CORS_ORIGINS` (empty by
default). The app sends neither `Sec-Fetch-Site` nor `Origin`, and passes
([security.md](security.md#csrf-cors-xss)).

## Versioning and compatibility

The API serves app versions that are already installed: a store release takes days to reach users,
some never update, and an OTA update cannot replace a binary. Every contract change must keep
working for the app versions still in use, not only for the one built from the same commit.

- **Additive changes are safe:** new routes, new optional request fields, new response fields (the
  app's Zod schemas drop keys they do not know).
- **Incompatible for installed versions:** removing or renaming a field they read; making a response
  field they require optional or nullable; a new value of an enum they validate (a role:
  `SessionUserSchema` in `apps/mobile/src/auth/schemas.ts` refuses it, and sign-in fails); a new
  required input; a stricter rule on an existing input; a changed status or meaning.
- **Deprecate before removing:** keep serving the field or the route, mark it in the contract
  (`@ApiOperation({ deprecated: true })` for a route, `.meta({ deprecated: true })` on a Zod field),
  and remove it only once no supported app version uses it.
- **An incompatible change** goes to a new route served next to the old one (a versioned path,
  `/api/v2/items`), or ships together with a raised minimum app version, once the version that no
  longer needs the old shape has reached most users
  ([releases.md](releases.md#minimum-supported-version)).
- **The API's own rollout:** during a deployment old and new API versions run side by side on one
  database, so every migration suits both ([database.md](database.md#expand-and-contract)).

## Minimum app version

Stores cannot force an update, so the API refuses versions it no longer serves
(`apps/api/src/common/http/app-version.middleware.ts`, decided in
[adr/0010-minimum-supported-app-version.md](adr/0010-minimum-supported-app-version.md)):

- A request with `X-App-Platform: ios` or `android` (any letter case) whose `X-App-Version` is below
  `MOBILE_MIN_VERSION_IOS` or `MOBILE_MIN_VERSION_ANDROID` gets `426`:

  ```json
  {
    "data": null,
    "message": "This version of the app is no longer supported: update it to continue"
  }
  ```

- The middleware runs right after the `Cache-Control` header (`app.setup.ts`), before any other
  check: authentication, rate limits (a 426 is not counted against them), validation.
- Each minimum is `major.minor.patch`, validated at boot; unset (the default), that platform is not
  checked.
- Versions are read as the stores show them: 1 to 3 numbers (`2`, `2.1`, `2.1.3`, the missing ones
  0), with an optional pre-release or build suffix that is ignored (`2.1.3-rc.1`, `2.1.3+45`). A
  request with `X-App-Platform` but without a readable version is refused once a minimum is set.
- Exempt: `/api/health/*`, and requests without `X-App-Platform` (curl, probes, other clients).
- Every refusal is counted: `app.client.outdated`, attribute `app.platform`
  ([observability.md](observability.md#metric-catalog)).
- Every route but the probes documents 426 in the contract.
- It is a compatibility gate, not a security control: any client can send any header.

The app sends neither header today, so the API never answers it 426; what the app needs (the
headers, an error kind, the update screen) is in
[releases.md](releases.md#minimum-supported-version).
