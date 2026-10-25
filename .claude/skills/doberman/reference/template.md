# This template: Golden Template Mobile

What Doberman must know about this repository to review a change in it. The repository's own
documents are the authority: [AGENTS.md](../../../../AGENTS.md),
[DEFINITION_OF_DONE.md](../../../../DEFINITION_OF_DONE.md),
[docs/code-review.md](../../../../docs/code-review.md) (the reviewer checklist this audit extends),
[docs/mobile-architecture.md](../../../../docs/mobile-architecture.md),
[docs/architecture.md](../../../../docs/architecture.md),
[docs/security.md](../../../../docs/security.md),
[docs/authorization.md](../../../../docs/authorization.md),
[docs/api-conventions.md](../../../../docs/api-conventions.md),
[docs/database.md](../../../../docs/database.md), [docs/testing.md](../../../../docs/testing.md),
[SECURITY.md](../../../../SECURITY.md), [docs/releases.md](../../../../docs/releases.md),
[docs/deploy-vps.md](../../../../docs/deploy-vps.md). When this file and those disagree, they win;
say so in the report.

## Contents

- [Stack](#stack)
- [Flows](#flows)
- [Invariants to check against](#invariants-to-check-against)
- [Red flags in a diff](#red-flags-in-a-diff)
- [Release impact](#release-impact)
- [Gates](#gates)
- [Whole-repository audit order](#whole-repository-audit-order)

## Stack

A pnpm workspace with three packages, and the server that runs two of them:

- **`apps/mobile`**: Expo SDK (see `expo` in `apps/mobile/package.json`; never trust memory for
  Expo APIs: AGENTS.md says how to check the docs of that version), React Native New Architecture,
  Hermes, Expo Router (typed routes, `Stack.Protected`), TypeScript strict, openapi-fetch, TanStack
  Query, Zustand, Zod, React Hook Form, SecureStore and the SQLite key-value store behind
  `apps/mobile/src/lib/storage`, Sentry behind `apps/mobile/src/lib/observability`, expo-notifications
  behind `apps/mobile/src/lib/notifications`, Jest + React Native Testing Library 14, Maestro, EAS.
- **`apps/api`**: NestJS, Prisma + PostgreSQL, Zod DTOs, optional Redis behind adapters, an email
  outbox and a push outbox (Expo's push service), OpenTelemetry and Sentry behind
  `apps/api/src/observability`, Vitest (unit specs, and integration specs over HTTP with supertest
  on PostgreSQL, Redis and Mailpit).
- **`apps/landing`**: the public site, Astro + Tailwind CSS, static pages in English and Spanish,
  no client JavaScript, Vitest; its web image (`apps/landing/Dockerfile`, nginx) serves the landing,
  the app's links under `/app/`, the files that let the phones claim them, and `/api` in front of
  the API. Playwright tests the built landing and the image.
- **Contract first, from the API**: the controllers and their Zod schemas generate
  `openapi/openapi.json`, then `apps/mobile/src/api/schema.d.ts` (`pnpm contract`).
- **The server**: `deploy/vps` (Caddy, the web image, the API, its migration job, Redis, and
  optionally PostgreSQL with its nightly backup), `infra/terraform` (DigitalOcean), `observability/`
  (Grafana dashboards, Prometheus alert rules); Docker images scanned by Trivy.

## Flows

**Phone to database:**

```
Route (apps/mobile/src/app/**, thin: validates params)
  → Screen (apps/mobile/src/features/<f>/<X>Screen.tsx: states, a11y, AlertText)
  → hook (apps/mobile/src/features/<f>/api.ts: useQuery / useInfiniteQuery / useMutation, query keys factory)
  → TanStack Query (apps/mobile/src/lib/query/queryClient.ts: retries, staleTime, error reporting)
  → api / publicApi (apps/mobile/src/api/client.ts: openapi-fetch typed from the contract,
                     the platform and version headers)
  → http pipeline (apps/mobile/src/api/http.ts: timeout, abort forwarding, request id, bearer token,
                   one replay after a 401, AppError mapping, breadcrumbs)
  → session (apps/mobile/src/auth/session.ts: access token in memory, refresh token in secureStorage,
             one renewal at a time, generation guard)
  → API request pipeline (apps/api/src/app.setup.ts + AppModule, in order):
      request id + context + access log → helmet → no-store → minimum app version (426)
      → CORS (if configured) → JSON-only bodies → Fetch Metadata guard → rate limiter
      → @Auth (JWT, then roles) → Zod validation pipe → controller (thin)
      → service (rules, ownership in the query, explicit select, user row lock) → Prisma → PostgreSQL
      → envelope interceptor { data, message } / error filter { data: null, message, errors? }
  → unwrap / unwrapWith(Schema) (apps/mobile/src/api/unwrap.ts: envelope + Zod)
  → cache → Screen
```

**Session, on the server** (`apps/api/src/auth/sessions.service.ts`,
[ADR 0007](../../../../docs/adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md)):

```
sign-in → { accessToken (15 min), refreshToken, expiresIn, user }: a new family per sign-in
401 → POST /api/auth/refresh { refreshToken } → a new pair, the old token used up → replay once
answer lost → the same token again within 30 s, its successor unused → a new pair, the unused
              successor superseded (a retry, not a theft)
any other replay of a used or superseded token → the whole family ends (theft), logged
logout → POST /api/auth/logout { refreshToken } → 204, this device's family ends
password change, reset, change of email → security version + 1: every access token ends at once
```

Sign-out (`session.signOut()` → `end()`): the `onBeforeSignOut` listeners first, while the session
still works (the push registration is removed: `DELETE /api/devices/{installationId}`, 3 seconds at
most), then generation bumped, access token dropped, refresh token removed from secure storage,
state `signedOut`, the `onSignOut` listeners in `apps/mobile/src/app/_layout.tsx`
(`queryClient.clear()`, image caches cleared, error reporter user reset, analytics reset), and last
the refresh token revoked on the server (`POST /api/auth/logout`, best effort: the phone already
forgot it). The `Stack.Protected` guards move the navigation. Screens never navigate after an auth
event.

**Email and push, through outboxes** (`apps/api/src/infrastructure/mail/**`,
`apps/api/src/infrastructure/push/**`, ADR 0005 and 0011):

```
feature transaction ─┬─ the business change
                     └─ MailOutboxService / PushOutboxService.enqueue(tx, ...): rows, ids only
after the commit → notifyQueued() wakes this instance's worker (otherwise every worker polls)
worker → claim due rows (FOR UPDATE SKIP LOCKED, a lease) → render → send with no transaction open
       → record the outcome, fenced by the claim; push: receipts 15 minutes later
```

## Invariants to check against

**Session and networking, in the app** (`apps/mobile/src/auth/session.ts`,
`apps/mobile/src/api/http.ts`)

- One renewal at a time (`renewOnce`): concurrent requests and 401s share it; a request that got a
  401 after someone else renewed reuses the new token (`refreshAfterRejection`).
- A renewal that lands after sign-out or a new sign-in (`generation` changed) is discarded and its
  tokens revoked: nothing resurrects an ended session.
- Only a 401 on renewal signs the user out; network failures and 5xx keep the session (offline
  restore).
- The access token never leaves memory; the refresh token only lives in `secureStorage`.
- Every request: timeout, the caller's abort signal forwarded, exactly one replay after a 401, no
  loops; failures become `AppError` (`network`, `timeout`, `cancelled`, `upgradeRequired`, …).
- Every request carries `X-App-Platform` and `X-App-Version`; a 426 is recorded once
  (`apps/mobile/src/features/update/upgrade.ts`) and leaves `update-required` as the only screen,
  never retried and never reported as a bug.
- After a link that ends every session of an account (a password reset, a confirmed change of email
  or its undo), `session.revalidate()` renews this phone's session, so a session the server ended
  ends at once.
- Breadcrumbs and logs carry the path only: no query string, no body, no token.

**Server state** (`apps/mobile/src/features/**/api.ts`, `apps/mobile/src/lib/query/**`)

- Server data only through TanStack Query hooks in the feature's `api.ts`, calling `api` with
  `unwrap`/`unwrapWith`; never `fetch` (lint), never copied into Zustand or `useState`.
- `queryFn` passes `signal` to the API call, so unmounts and newer queries cancel the old request.
- Query keys come from the feature's key factory and include every parameter.
- Mutations are never retried automatically (`retry: false`); optimistic updates cancel the
  in-flight queries of that key first (`cancelQueries`), keep a snapshot, roll back on error, and
  invalidate on settle (see `useCreateItem`).
- Only transient errors are retried (`isRetryable`); a 4xx is an answer.

**Screens and navigation** (`apps/mobile/src/app/**`, `apps/mobile/src/features/**`)

- Routes are thin; protected screens live behind `Stack.Protected` in
  `apps/mobile/src/app/_layout.tsx` (its `redirectTo` decides where a refused route lands).
- Every screen handles loading, empty, error and offline states, and recovers without a restart;
  double taps on submit do not send twice; interrupted flows (backgrounding, lost connection, a
  session expiring while the screen is open) behave.
- Account entries (sign-up, password recovery, change of email, invitations) appear only once
  `useCapabilities()` says the server offers them; admin screens are a convenience behind the admin
  guard: the API decides. Sign-up and recovery screens never tell whether an address has an
  account.
- Components from `apps/mobile/src/ui` only; theme tokens (no color literals); every control with a
  role and accessible name; 48 dp targets; messages that appear without navigation use `AlertText`;
  every new screen is in `apps/mobile/src/a11y.spec.tsx`.

**Untrusted input** (`apps/mobile/src/lib/links.ts`, `apps/mobile/src/app/+native-intent.tsx`,
`apps/mobile/src/auth/linkTokens.ts`, `apps/mobile/src/lib/notifications`)

- Links and notification payloads pass the allowlist of `apps/mobile/src/lib/links.ts` (query
  strings dropped, ids restricted to `[A-Za-z0-9_-]{1,64}`); a link opens a screen, never performs
  an action.
- An emailed link's one-time token travels in the fragment and lives only in `linkTokens` (memory,
  one per screen, taken once, forgotten after 30 minutes): never in the internal path, the
  navigation state, analytics or breadcrumbs.
- API responses validated with Zod (`unwrapWith`) where the shape matters; route params validated.

**Storage and privacy** (`apps/mobile/src/lib/storage/**`, `apps/mobile/src/store/**`,
SECURITY.md#data-inventory)

- Every key in `STORAGE_KEYS`; credentials in `secureStorage`; nothing sensitive or personal in
  `persistentStorage`; no AsyncStorage.
- New data the app keeps or sends has its row in the data inventory and, if it belongs to the user,
  is cleared at sign-out.
- Stored data from the previous app version still loads (preferences schema, storage keys) or is
  migrated.

**Configuration and native** (`apps/mobile/app.config.ts`, `apps/mobile/eas.json`,
`apps/mobile/src/config/**`)

- Configuration read only through `apps/mobile/src/config/env.ts`; a new variable in
  `env.schema.ts`, its line in `env.ts`, `apps/mobile/.env.example` and
  docs/releases.md#environment-variables. `EXPO_PUBLIC_*` is public: never a secret.
- New permissions declared with their usage text, asked in context, reflected in the store privacy
  declarations (docs/store-compliance.md).
- `apps/mobile/android/` and `apps/mobile/ios/` are generated (`expo prebuild`) and never committed.

**API authorization and input** (`apps/api/src/**`, docs/authorization.md)

- `@Auth(...)` on every non-public route (no roles = any signed-in user); a public route has a
  written reason. Handler-level `@Auth()` inside an `@Auth('admin')` controller keeps admin.
- Ownership in the service's query: a user asking for another user's record gets 404, exactly the
  answer of a missing one (`UsersService.findVisible` is the pattern). Every owned record has its
  authorization matrix in the integration spec (`expectRecordAccess` in `apps/api/test/access.ts`:
  anonymous 401, another account 404, the owner, an admin where allowed).
- Zod schemas for bodies and queries (`@ZodBody`, `@ZodQuery`), sizes bounded; a 400 about one field
  through `fieldError()`; responses from an explicit `select` (never the password hash, never a
  whole row); `@ApiData` / `@ApiErrors` keep the contract honest.
- `process.env` only in `apps/api/src/env/env.ts`; a new variable in `env.schema.ts`,
  `apps/api/.env.example` and docs/environment.md; optional integrations off by default and never
  stopping the boot.

**API sessions and accounts** (`apps/api/src/auth/**`, `apps/api/src/account/**`,
`apps/api/src/invitations/**`, docs/security.md#authentication-and-tokens)

- Refresh tokens: 32 random bytes, stored as SHA-256; single use; rotation inside a family; the 30 s
  reuse window only while the successor is unused, and a retry keeps the first rotation's time;
  concurrent renewals of one token serialized by the user's row lock, the last pair the live one;
  a family never left with two live sessions or none.
- Every change to a user's sessions or account (sign-in, rotation, logout, revocation, new
  password, reset, change of email, deletion) takes that user's row lock first, in READ COMMITTED;
  revoking by hand goes through `SessionsService.revokeAll` or `lockUser`, never a plain `UPDATE`.
- A wrong password on the signed-in forms (account deletion, password and email changes) answers
  403, never 401 (the app would renew and replay); only a 401 means the session ended.
- Sign-up and password recovery answer the same whether the address is registered; one-time links
  expire, work once, and are hashed at rest; the only administrator cannot delete their account.
- Rate limits count per account or signed-in user with per-IP ceilings (carrier NAT); a route's
  own limit uses `@RouteRateLimit`, never `@Throttle({ default: ... })`.
- The minimum app version (`common/http/app-version.middleware.ts`) answers 426 before any other
  check and never counts against the limits; a request without `X-App-Platform` passes. It is a
  compatibility gate, not a security control.
- No cookies: credentials only in the `Authorization` header or a JSON body; the Fetch Metadata
  guard and JSON-only bodies stay on every route (browsers reach the API through the web image).

**Database** (`apps/api/prisma/**`, docs/database.md)

- Schema changes ship as a committed migration made by `pnpm db:migrate`; a committed migration
  is never edited (`migrate-deploy` refuses one); a step that drops or renames what the running
  version reads follows expand/contract with its `-- contract:` reason.
- New queries have their indexes; list queries are paginated with a bounded limit; raw SQL only
  through the tagged `$queryRaw` (lint bans the unsafe variants).
- Writes that must be atomic use a transaction; concurrent writers of the same row are serialized
  (row lock, `LockService`) or idempotent (`IdempotencyService`, the `Idempotency-Key` of item
  creation: 201 again for the same body, 422 for another, 409 while the first runs).
- Account deletion: one transaction, the cascades take the user's rows (items, sessions, links,
  devices, queued messages); a hard delete.

**Infrastructure, outboxes and push** (`apps/api/src/infrastructure/**`,
`apps/api/src/devices/**`, `apps/mobile/src/features/notifications/**`)

- Redis, Sentry and the OpenTelemetry SDK only behind `CacheService`, `LockService`,
  `IdempotencyService`, `errorTracker()` and `observability/` (lint rule); without Redis the API
  degrades as docs/architecture.md#degradation says (the rate limiter falls back per instance,
  never open), and that path is tested.
- External calls through `createExternalHttpClient`: a timeout per attempt, retries only for
  idempotent requests and retryable failures; a push send is never retried by the client (at least
  once, never twice by its own retry).
- Outbox rows are written in the transaction of the change they report, so they exist if and only
  if it committed; `notifyQueued()` only after the commit; every transition after a claim is fenced
  by it (a worker whose lease ran out cannot overwrite another's outcome).
- Push: ids only in the payload; the title and body rendered at send time, stored nowhere, never
  personal data (lock screens); `data.url` a path `links.ts` accepts; tokens never logged (a
  device is named by its id); `DeviceNotRegistered` disables the device; another account's
  installation answers 404. Without `PUSH_ENABLED` nothing is queued and readiness says
  `checks.push: "disabled"`.
- The app registers its token at every start and sign-in once notifications are allowed, never asks
  for the permission there, registers again when the token changes or another account's session is
  adopted, and removes the installation before the session ends.

**Observability** (`apps/mobile/src/lib/observability/**`, `apps/mobile/src/lib/analytics/**`,
`apps/api/src/observability/**`, `observability/**`)

- App: `reportError()` and `logger`, never `console.log`; redaction (`redact.ts`) not bypassed.
  API: `new Logger(...)` (redacted output), code logs ids, never personal data; `errorTracker()`
  once per unexpected error. No tokens, passwords or personal data in logs, breadcrumbs, reports or
  analytics events.
- Metrics use low-cardinality attributes only; a new or renamed metric updates
  `observability/api-metrics.json` (`metrics-catalog.spec.ts`), and the dashboards and alert rules
  read only catalogued series, each alert with its runbook in docs/incident-response.md.

**Landing and the app's links** (`apps/landing/**`, `apps/mobile/src/lib/links.ts`)

- Every visible text comes from the dictionaries (`src/i18n/en.ts`, `es.ts`), written in both
  languages in the same change; a page exists in every language (`src/pages/`, `src/pages/es/`).
- Static HTML and CSS only: no client script, no inline `style` attribute or `<style>` tag rendered
  into a page (the web server's Content-Security-Policy, `script-src 'none'`, refuses them), no font
  or asset from another origin; the JavaScript budget of `apps/landing/performance-budget.json` is
  0 kB; Tailwind classes from `src/styles/global.css` only (lint).
- One `h1` per page, a heading on every section, landmarks, the skip link, `lang` on the page and on
  each language link; a picture of the app carries `role="img"` and a label in the page's language.
- The app's links live under `/app/` in three places that change together: the API's
  `APP_BASE_PATH` (the links it emails), `apps/mobile/src/lib/links.ts` (the allowlist and the
  Android `appLink` paths) and the web image (`apps/landing/nginx`: the open-in-app page at the
  link's own address, no redirect; `apple-app-site-association` and `assetlinks.json` from the
  app's identity, 404 without it). `scripts/web-server-routes.test.mjs`, `scripts/app-links.test.mjs`
  and `apps/landing/src/lib/links.spec.ts` fail when one changes alone.

**Server and images** (`deploy/**`, `infra/**`, `apps/*/Dockerfile`, docs/deploy-vps.md)

- Images: pinned base digests, non-root, no package managers in the runtime; nothing secret in an
  image or a compose file.
- The deploy runs the migration (`api-migrate`, the migrator role) before the new version and stops
  there if it fails; images are pulled by digest; a failed release puts the previous one back.
- The data tier (PostgreSQL, its backup, Redis) on the internal network only, never published;
  database roles (`deploy/vps/db-init.sh`) and the Redis ACL no wider than docs/security.md.
- Terraform reproduces docs/deploy-vps.md: no secret with a default or in a non-sensitive output,
  firewalls as narrow as the guide, the lock file and the pinned versions updated together.

**Gates and supply chain**

- No threshold (`apps/mobile/jest.config.js`, `apps/api/vitest.config.ts`,
  `apps/landing/vitest.config.ts`), lint rule, budget (`apps/mobile/bundle-budget.json`,
  `apps/landing/performance-budget.json`), ignore file, supply-chain setting
  (`pnpm-workspace.yaml`: `minimumReleaseAge` and its exclusions, `trustPolicy`, `allowBuilds`,
  overrides, `audit.ignore`), dependency policy (`scripts/dependency-policy.json`) or workflow
  permission weakened; `nosemgrep` and `eslint-disable` carry their reason on the same line.
- Dependencies go to the package that uses them: the app's with `pnpm --filter mobile exec expo
install`, the API's with `pnpm --filter api add`, the root only gets repository tooling; each one
  justified; EAS CLI is never a dependency.
- Releases (builds, submissions, OTA updates, deployments) only through the manual workflows from
  `main`, started by people.
- A deployment change updates docs/deploy-vps.md and both step-by-step guides; the manual and the
  step-by-step guide change in English and Spanish together.

## Red flags in a diff

Each one is a lead to verify, not a finding by itself:

- `useEffect` + `api.GET/POST` + `setState` or a Zustand `set`: server state outside TanStack
  Query, usually without cancellation, with out-of-order and post-sign-out writes.
- A `queryFn` that ignores `signal`; an `await` followed by a state write with no check that the
  result is still wanted.
- A Zustand store with `persist` holding server data or personal data; a new storage key outside
  `STORAGE_KEYS`; anything per user that `onSignOut` does not clear.
- A mutation with `retry`, or a submit button not disabled while `isPending`.
- `setQueryData` without `cancelQueries` first; a rollback snapshot shared by overlapping mutations.
- Changes to `renewOnce`, `generation`, `end()`, `refreshAfterRejection`, `revalidate()` or the
  replay in `http.ts`; on the server, to the reuse window, the row lock, family revocation or the
  security version.
- A new route that reads params without validation, or a link route without a test in
  `links.spec.ts`; a link path changed in one of its three places only.
- A new controller method without `@Auth` (or with a weaker role than its controller), or a service
  method that loads by id without checking the actor; a new owned record without its access matrix.
- `findUnique`/`findMany` without `select`, or a response built by spreading a Prisma row.
- `$queryRawUnsafe`, `$executeRawUnsafe`, string-built SQL, `orderBy` from user input without an
  allowlist, `take` without a maximum.
- `process.env` outside `env.ts`; a new secret with a default value; an optional integration that
  throws when unconfigured.
- An email or push enqueued outside the transaction of its change, `notifyQueued()` before the
  commit, a send with HTTP retries, personal data in a notification's text, a push token in a log.
- A migration that drops or renames a column or table in one step; an edited migration.
- `openapi/openapi.json` or `apps/mobile/src/api/schema.d.ts` edited without `pnpm contract`; a
  controller change without them; a contract change that is not additive (installed apps keep the
  old contract); the mock API (`apps/mobile/scripts/mock-api.mjs`) left behind.
- `console.*`, string-interpolated errors with user data, analytics events with ids or emails.
- A `<script>`, an inline `style`, an external font or asset in the landing; a text in one
  dictionary only.
- New native dependency or config plugin: store build, prebuild, permissions, privacy manifest.
- A published port for the data tier, an unpinned image, a secret in a compose or Terraform file.
- Tests stubbing with instant responses for a flow whose bug would be a race; tests that only
  assert `toHaveBeenCalled`; integration tests that only test the happy path of a protected route.

## Release impact

**The app:** JavaScript-only changes can ship as an OTA update to the same runtime version;
anything native (a module, a config plugin, permissions, native fields of
`apps/mobile/app.config.ts`, the SDK, the Node.js of `eas.json`) needs a store build and changes the
fingerprint runtime version (docs/releases.md). Check the pull request declares the right one.

**The API and the web image:** released together by the deploy workflow (images built, scanned,
migrations run before the new version). Check: migrations safe while the previous version runs, new
environment variables documented and defaulted safely, and compatibility with every app version
still installed: contract changes are additive, or coordinated through the minimum supported
version (docs/releases.md#minimum-supported-version, docs/api-conventions.md); breaking changes
marked (`!`, `BREAKING CHANGE:`).

## Gates

The plan comes from `doberman.mjs start` (`verify` in `package.json`, plus the CI-only gates of
`template.json`). Notes:

- `pnpm verify` = format, lint, typecheck (contract drift, typed routes and `astro check`
  included), tests with coverage (the app's accessibility spec, the API's OpenAPI drift spec, the
  landing's units), Expo Doctor, security (audit, dependency and license policy, secretlint), build
  (the API, the landing, the app's bundles) and budgets. Run them one by one so each gets its own
  result.
- `pnpm test:integration` needs PostgreSQL: `DATABASE_URL` from the environment or `apps/api/.env`
  (without it: `SKIPPED — REQUIRES CONFIGURATION`; never create the file). The plan's `services`
  says how to start the development services (`pnpm services:up`: PostgreSQL, Redis and Mailpit)
  and stop them (`docker compose stop db redis mailpit`). It runs on `<db>_test` after replaying
  every migration on `<db>_shadow`; the Redis adapter specs and the outbox specs use `REDIS_URL` and
  `MAIL_SMTP_URL` of `apps/api/.env` (or `REDIS_TEST_URL` and `MAIL_TEST_SMTP_URL`); without a URL
  they are skipped locally: report them as not run.
- `pnpm test:e2e` after `pnpm --filter landing build`: Playwright starts the landing's preview and
  builds and runs the web image by itself (Docker), and needs Chromium installed (never install it
  on the user's behalf).
- Images: only when the change touches what goes into them (paths in the plan); build with the
  workflow's Dockerfiles and targets (`api`, `api-migrate`, `web`), scan with the pinned Trivy, then
  remove the `doberman-scan/*` images.
- `pnpm test:scripts` (CI only, outside `verify`): the tests of the repository's own scripts (the
  Doberman engine, the dependency policy, the tool images, Semgrep's file selection, the mock API
  against the contract, the web image's scripts, the deployment scripts, the observability files).
- `pnpm iac:check` (Docker and the network) only when the change touches `infra/`,
  `deploy/vps/db-init.sh`, the tool images or its scripts: Terraform checks, TFLint, Trivy,
  cloud-init and the two roles scripts. Never a real `terraform plan` or `apply`: they need a
  DigitalOcean account and token.
- `pnpm observability:check` (Docker; when `observability/**` or the tool images change):
  dashboards and alert rules against the runbooks and the metric catalog, then promtool and the
  rules' tests.
- `pnpm sast` and `pnpm lint:workflows` need Docker; `pnpm security` and `pnpm expo:doctor` need the
  network. gitleaks scans the history: it needs commits; on Windows (Git Bash) the plan's
  `commandWindows` passes a Windows path to Docker.
- `pnpm contract` writes files: never run it in the workspace. Contract drift is already checked by
  `pnpm typecheck` and the drift spec in `pnpm test:coverage`.
- Prebuild writes `apps/mobile/android/` and `apps/mobile/ios/`: run it in the sandbox only. Never
  run `pnpm prebuild` (it is `--clean`) in the workspace. On Windows, Expo generates
  `apps/mobile/android/` only (it skips iOS there): the iOS half is UNVERIFIED unless Docker is
  available to run the same command in a Linux container (`node:24-bookworm-slim`, frozen install,
  then the prebuild) on a copy of the sandbox.
- Android E2E (docs/testing.md#end-to-end) needs an emulator or device, JDK 17 and Maestro on the
  `PATH` (`pnpm test:e2e:mobile` calls `maestro`); the stack suite also needs the development
  services and the API (`pnpm dev`). On Windows the native build also needs a short path
  (`DOBERMAN_TMP=C:\dbm` before `start`) and a hoisted `node_modules` in the sandbox
  (`pnpm_config_node_linker=hoisted`). It is not part of "CI passed", but a change to a critical
  journey should run it.
- iOS builds need macOS with Xcode: elsewhere `SKIPPED — REQUIRES MAC/iOS ENVIRONMENT`.
- Not local gates: CodeQL (GitHub) and DAST (`.github/workflows/dast.yml`, weekly or by hand,
  against the stack or staging). A change to the request pipeline, the web image or the deployment
  names them as not run, never as passed.
- `pnpm lint` and `pnpm typecheck` run `expo customize tsconfig.json` in `apps/mobile`
  (`pnpm --filter mobile types:generate`); the clean step reports it if that rewrote
  `apps/mobile/tsconfig.json`.

## Whole-repository audit order

With `--full` or a repository without commits, review by risk, following the flows instead of
reading every file: API authorization and ownership → sessions, on the server and in the app →
request pipeline hardening (rate limits, Fetch Metadata, headers, the minimum version) → input and
output validation and the contract → database and migrations → server state and mutations →
sign-out cleanup and storage → links, emailed tokens and the app's links in their three places →
outboxes and push notifications → infrastructure degradation → configuration, permissions and
native → observability and redaction → screens and accessibility → the landing → deployment,
images and infrastructure as code → gates, CI and supply chain → tests (do they prove the above?)
→ docs consistency.
