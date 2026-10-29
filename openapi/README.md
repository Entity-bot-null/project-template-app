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
   `apps/mobile/src/auth/schemas.ts`; each `satisfies` its generated type) for new or changed
   endpoints.
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

## One implementation: the API

The app has one backend, this API: nothing else implements the contract, so nothing else has to be
kept in step with it ([docs/adr/0013-real-api-only.md](../docs/adr/0013-real-api-only.md)). In
development the app talks to `pnpm dev` (`http://localhost:3010`), with the seed's accounts
(`pnpm db:seed`: `member@example.com` / `member-password` and `admin@example.com` /
`admin-password`, the member's 45 example items); the email it sends lands in Mailpit.

The end-to-end flows reach the API through the e2e proxy (`apps/mobile/scripts/e2e-proxy.mjs`): it
passes every request and every answer through unchanged, and fails on demand, through control
endpoints under `/__e2e/` that are not part of this contract, what a healthy API never fails: a
status for one route (429, a 5xx, or no answer at all), and expiring or revoking every session (the
API then refuses the tokens itself). The flows use them, and they show an error state by hand
([docs/testing.md](../docs/testing.md#end-to-end)).
