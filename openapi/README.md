# API contract

`openapi.json` is the contract between the app and its backend: the endpoints, their inputs and
their responses. The app's API types are generated from it, so a call that does not match the
contract does not compile. It is committed and reviewed like code.

```
openapi/openapi.json               ← the backend's OpenAPI document, committed, reviewed
        │  pnpm contract
        ▼
apps/mobile/src/api/schema.d.ts    ← generated types (never edited)
        │
        ▼
apps/mobile/src/api/client.ts      ← api / publicApi (openapi-fetch), typed by the contract
        │
        ▼
apps/mobile/src/features/*/api.ts  ← query and mutation hooks, responses validated with Zod
```

The file shipped with the template is an **example** (sign-in, session renewal, profile, items) that
the example feature and `apps/mobile/scripts/mock-api.mjs` implement. Replace it with the product's
contract (REQUIERE CONFIGURACIÓN).

## Workflow

1. **Get the contract.** When the backend generates its OpenAPI document (as the web template's API
   does), download it from the backend's repository or its running instance into
   `openapi/openapi.json`. When the API does not exist yet, write the change here first and agree on
   it with the backend team in the pull request: contract first.
2. **Generate**: `pnpm contract` writes `apps/mobile/src/api/schema.d.ts`.
3. **Fix what no longer compiles**: every call, fixture and schema affected by the change shows up
   in `pnpm typecheck`.
4. **Update the Zod schemas** of the responses the app reads (`apps/mobile/src/features/*/api.ts`,
   `apps/mobile/src/auth/schemas.ts`) and the mock API (`apps/mobile/scripts/mock-api.mjs`) for new
   or changed endpoints.
5. **Commit both files.** `pnpm typecheck` (pre-push hook and CI) fails when `schema.d.ts` does not
   match `openapi.json`.

Installed apps are not updated together with the backend: a contract change must keep working for
the app versions still in use (add fields and endpoints; deprecate before removing; version the
endpoint for incompatible changes).

## What the app expects from the API

These conventions are built into `apps/mobile/src/api/` and `apps/mobile/src/auth/`; a backend that
differs needs those modules adapted.

| Convention     | Shape                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope       | success: `{ "data": …, "message": "…" }`; failure: `{ "data": null, "message": "…", "errors": [{ "path": "email", "message": "…" }] }` (field errors optional)                          |
| Status codes   | 400/422 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate limited, 5xx server ([errors](../docs/mobile-architecture.md#errors))                     |
| Sign-in        | `POST /api/auth/sign-in` `{ email, password }` → `{ accessToken, refreshToken, expiresIn, user }`                                                                                       |
| Renewal        | `POST /api/auth/refresh` `{ refreshToken }` → new `{ accessToken, refreshToken, expiresIn }`; the old refresh token stops working (rotation); 401 when it is invalid, reused or revoked |
| Sign-out       | `POST /api/auth/logout` `{ refreshToken }` revokes it                                                                                                                                   |
| Authentication | `Authorization: Bearer <accessToken>` on every other endpoint                                                                                                                           |
| Pagination     | `limit` and `offset` query parameters → `{ items, total }`                                                                                                                              |
| Tracing        | the app sends `X-Request-Id` on every request; the backend logs it                                                                                                                      |

A mobile client keeps the refresh token in the device's secure storage and sends it in the request
body: a backend that serves a web app with an HTTP-only refresh cookie exposes these body-based
endpoints for mobile clients, with the same rotation and reuse detection.

## The mock API

`pnpm mock:api` (`apps/mobile/scripts/mock-api.mjs`) implements this contract in memory, for local
development and the end-to-end flows: accounts `member@example.com` / `member-password` and
`admin@example.com` / `admin-password`, 45 example items, rotating single-use refresh tokens.
`MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` makes access tokens expire quickly, to watch the app renew
its session; `MOCK_LATENCY_MS=1500` slows every answer, to see loading states; `MOCK_API_PORT` moves
it from 4010 (then change `EXPO_PUBLIC_API_URL` and the `adb reverse` port to match). It is not a
backend: no persistence, public passwords, local HTTP only.

It also fails on demand, through control endpoints under `/__mock/` that are not part of this
contract: a status for one route (429, a 5xx, or no answer at all), and expiring or revoking every
session. The end-to-end flows use them, and they show an error state by hand
([docs/testing.md](../docs/testing.md#end-to-end)).
