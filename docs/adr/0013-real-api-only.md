# 0013. Run the app against the real API only; inject end-to-end failures with a proxy

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** template maintainers

## Context

The app started as a template without a backend, so it shipped a mock API
(`apps/mobile/scripts/mock-api.mjs`): an in-memory implementation of the contract, the default
backend of local development and of the Maestro flows, kept true to `openapi/openapi.json` by its
own test ([0002](0002-pnpm-monorepo.md)). The template now has its own API (`apps/api`, NestJS on
PostgreSQL), and `pnpm dev` starts it together with the landing.

Two backends for one app cost more than they give:

- every route exists twice: a change to the API meant the same change to the mock, by hand;
- the mock is simpler than the API where the app "cannot tell" (refresh tokens without a reuse
  window, no rate limits, a weaker password check), so a flow green against the mock proved less
  than it seemed;
- the default development setup ran against the mock, so a new project's first sessions never met
  the database, the email outbox, the rate limits or the session rules it would ship with.

The Maestro flows still need what a healthy API never does on demand: a 429 on sign-in, a 5xx on a
list, a connection that drops before the answer, an access token that stops working early, a
session ended on the server while the app is open.

## Options

1. **Keep the mock for the flows only:** no change to the flows; the duplicate implementation and
   its drift stay, and the flows keep testing a backend that is not the product's.
2. **Drop the failure scenarios from the flows:** the real API alone; the Jest specs still cover
   those states, but no end-to-end flow proves them on a device any more.
3. **Failure switches inside the API:** control routes enabled by a variable outside production;
   test code in the server that is deployed, one configuration mistake away from production.
4. **A proxy in front of the API for the flows:** every request reaches the API unchanged and every
   answer is the API's; the proxy fails on demand only a status for a route, a dropped connection,
   or a token (it replaces an access token with one never issued, and ends sessions through the
   API's own logout), so the 401s and refusals come from the API.

## Decision

Option 4. The mock API is removed. Development and every Maestro flow run against the API in
`apps/api`, seeded with `pnpm db:seed`. The e2e build talks to `apps/mobile/scripts/e2e-proxy.mjs`
on `localhost:4010`, which passes every request to the API on `localhost:3010` and keeps the control
endpoints of the old mock under `/__e2e/` (faults, faults/clear, sessions/expire, sessions/revoke),
so the flows keep every scenario. `pnpm test:e2e:mobile` and `pnpm test:e2e:mobile:stack` start the
proxy, run Maestro and stop it. The development build talks to the API directly.

## Consequences

- One implementation of the contract: the API's drift spec and the app's `satisfies` schemas keep
  the app and the API in step; nothing else to update by hand.
- Local development and the end-to-end flows need Docker (PostgreSQL, Redis, Mailpit) and
  `pnpm dev`; working on the app without the API is no longer possible.
- `pnpm db:seed` resets the example member to its 45 items, removing the ones created since, so the
  flows start from the same data on every local run (CI starts from an empty database anyway).
- The proxy is test tooling: plain HTTP on `127.0.0.1` only, never deployed, tested by
  `apps/mobile/scripts/e2e-proxy.test.mjs` (`pnpm test:scripts`).
- The development-only switches of the mock (`MOCK_ACCESS_TTL_SEC`, `MOCK_LATENCY_MS`) are gone;
  the proxy, run alone (`node apps/mobile/scripts/e2e-proxy.mjs`), shows an error state or a
  renewal by hand.
- Wrong if the flows start failing for reasons the proxy introduces rather than the app or the API:
  then the proxy is doing more than passing requests through.
