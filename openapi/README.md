# API contract

`openapi.json` is the contract between the app and the API: the endpoints, their inputs and their
responses. The API generates it from its controllers and Zod schemas; the app's API types are
generated from it, so a call that does not match the contract does not compile. It is committed and
reviewed like code, and never edited by hand.

```
apps/api/src/**                    ← controllers and Zod schemas: the source of truth
        │  pnpm contract (pnpm --filter api openapi:export)
        ▼
openapi/openapi.json               ← the OpenAPI document, committed, reviewed
        │  pnpm contract (pnpm --filter mobile api:types)
        ▼
apps/mobile/src/api/schema.d.ts    ← generated types (never edited)
        │
        ▼
apps/mobile/src/api/client.ts      ← api / publicApi (openapi-fetch), typed by the contract
        │
        ▼
apps/mobile/src/features/*/api.ts  ← query and mutation hooks, responses validated with Zod
```

## Workflow

1. **Change the API**: the route, its Zod schemas (`@ZodBody`, `@ZodQuery`, `@ApiData`) and its
   tests ([docs/api-conventions.md](../docs/api-conventions.md)).
2. **Generate**: `pnpm contract` writes `openapi/openapi.json`, then
   `apps/mobile/src/api/schema.d.ts`.
3. **Fix what no longer compiles**: every call, fixture and schema of the app affected by the change
   shows up in `pnpm typecheck`.
4. **Update the app's Zod schemas** of the responses it reads (`apps/mobile/src/features/*/api.ts`,
   `apps/mobile/src/auth/schemas.ts`; each `satisfies` its generated type) and the mock API
   (`apps/mobile/scripts/mock-api.mjs`) for new or changed endpoints.
5. **Commit both generated files.** Two checks fail on drift: the API's
   `apps/api/src/openapi/openapi.spec.ts` (the document the controllers produce against
   `openapi.json`, in `pnpm test`) and the app's `pnpm typecheck` (`schema.d.ts` against
   `openapi.json`).

The schemas a client works with have names in the contract (`.meta({ id: 'Item' })` →
`#/components/schemas/Item`): `components['schemas']['Item']` in the app. One name for two different
schemas fails the document build.

Installed apps are not updated together with the API: a contract change must keep working for the
app versions still in use. Add fields and endpoints; deprecate before removing; an incompatible
change goes to a new route, or ships together with a raised minimum app version
([docs/adr/0010-minimum-supported-app-version.md](../docs/adr/0010-minimum-supported-app-version.md)).

## What the app expects from the API

These conventions are built into `apps/mobile/src/api/` and `apps/mobile/src/auth/`, and into the
API.

| Convention      | Shape                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope        | success: `{ "data": …, "message": "…" }`; failure: `{ "data": null, "message": "…", "errors": [{ "path": "email", "message": "…" }] }` (`errors` on a 400 that names its fields)                            |
| Status codes    | 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 unprocessable, 426 app version no longer supported, 429 rate limited, 5xx server ([errors](../docs/error-handling.md)) |
| Sign-in         | `POST /api/auth/sign-in` `{ email, password }` → a session `{ accessToken, refreshToken, expiresIn, user }`                                                                                                 |
| Renewal         | `POST /api/auth/refresh` `{ refreshToken }` → a new session; the old refresh token stops working (rotation), except for a retry within 30 seconds; 401 when it is invalid, reused or revoked                |
| Sign-out        | `POST /api/auth/logout` `{ refreshToken }` → 204; ends the session's family                                                                                                                                 |
| Authentication  | `Authorization: Bearer <accessToken>` on every other endpoint but the public ones (`/api/auth/*`, `/api/health/*`)                                                                                          |
| Pagination      | `limit` (1–100, 20 by default) and `offset` query parameters → `{ items, total }`                                                                                                                           |
| Idempotency     | an optional `Idempotency-Key` header on creates (`POST /api/items`): a retry with the same key and body gets the first result                                                                               |
| Tracing         | the app sends `X-Request-Id` on every request; the API logs it and answers with it                                                                                                                          |
| Minimum version | the API reads `X-App-Platform` (`ios`, `android`) and `X-App-Version`; below `MOBILE_MIN_VERSION_<PLATFORM>` it answers 426                                                                                 |

The session design (tokens in the body, rotation, the reuse window, why):
[docs/adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md](../docs/adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md).

## The mock API

`pnpm mock:api` (`apps/mobile/scripts/mock-api.mjs`) implements the contract's session, profile and
items routes in memory, for working without the API and for the end-to-end flows: accounts
`member@example.com` / `member-password` and `admin@example.com` / `admin-password`, the member's 45
example items with the ids `pnpm db:seed` gives the API, single-use refresh tokens.
`MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` makes access tokens expire quickly, to watch the app renew
its session; `MOCK_LATENCY_MS=1500` slows every answer, to see loading states; `MOCK_API_PORT` moves
it from 4010 (then change `EXPO_PUBLIC_API_URL` and the `adb reverse` port to match). It is not a
backend: no persistence, public passwords, local HTTP only.

`apps/mobile/scripts/mock-api.test.mjs` (`pnpm test:scripts`) keeps it true to `openapi.json`: it
fails when the mock serves a route or a method the contract does not have, answers a status the
contract does not declare for the route, or sends a body that breaks the contract's schema.

It also fails on demand, through control endpoints under `/__mock/` that are not part of this
contract: a status for one route (429, a 5xx, or no answer at all), and expiring or revoking every
session. The end-to-end flows use them, and they show an error state by hand
([docs/testing.md](../docs/testing.md#end-to-end)).
