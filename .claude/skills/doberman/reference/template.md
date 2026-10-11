# This template: Golden Template Mobile

What Doberman must know about this repository to review a change in it. The repository's own
documents are the authority: [AGENTS.md](../../../../AGENTS.md),
[DEFINITION_OF_DONE.md](../../../../DEFINITION_OF_DONE.md),
[docs/MOBILE_ARCHITECTURE.md](../../../../docs/MOBILE_ARCHITECTURE.md),
[docs/TESTING.md](../../../../docs/TESTING.md), [SECURITY.md](../../../../SECURITY.md),
[docs/RELEASES.md](../../../../docs/RELEASES.md). When this file and those disagree, they win; say
so in the report.

## Contents

- [Stack](#stack)
- [Flows](#flows)
- [Invariants to check against](#invariants-to-check-against)
- [Red flags in a diff](#red-flags-in-a-diff)
- [Release impact](#release-impact)
- [Gates](#gates)
- [Whole-repository audit order](#whole-repository-audit-order)

## Stack

Expo SDK (see `expo` in `package.json`; never trust memory for Expo APIs: AGENTS.md says how to
check the docs of that version), React Native New Architecture, Hermes, Expo Router (typed routes,
`Stack.Protected`), TypeScript strict, OpenAPI contract first (`openapi/openapi.json` →
`src/api/schema.d.ts` by `pnpm contract`), openapi-fetch, TanStack Query, Zustand, Zod, React Hook
Form, SecureStore and the SQLite key-value store behind `src/lib/storage`, Sentry behind
`src/lib/observability`, Jest + React Native Testing Library 14, Maestro, EAS.

## Flows

```
Route (src/app/**, thin: validates params)
  → Screen (src/features/<f>/<X>Screen.tsx: states, a11y, AlertText)
  → hook (src/features/<f>/api.ts: useQuery / useInfiniteQuery / useMutation, query keys factory)
  → TanStack Query (src/lib/query/queryClient.ts: retries, staleTime, error reporting)
  → api (src/api/client.ts: openapi-fetch typed from the contract)
  → http pipeline (src/api/http.ts: timeout, abort forwarding, request id, bearer token,
                   one replay after a 401, AppError mapping, breadcrumbs)
  → session (src/auth/session.ts: access token in memory, refresh token in secureStorage,
             one renewal at a time, generation guard)
  → backend (contract) → unwrap / unwrapWith(Schema) (src/api/unwrap.ts: envelope + Zod)
  → cache → Screen
```

Sign-out (`session.signOut()` → `end()`): generation bumped, access token dropped, refresh token
removed from secure storage, state `signedOut`, then the `onSignOut` listeners in
`src/app/_layout.tsx`: `queryClient.clear()`, image caches cleared, error reporter user reset,
analytics reset; the `Stack.Protected` guards move the navigation. Screens never navigate after an
auth event.

## Invariants to check against

**Session and networking** (`src/auth/session.ts`, `src/api/http.ts`)

- One renewal at a time (`renewOnce`): concurrent requests and 401s share it; a request that got a
  401 after someone else renewed reuses the new token (`refreshAfterRejection`).
- A renewal that lands after sign-out or a new sign-in (`generation` changed) is discarded and its
  tokens revoked: nothing resurrects an ended session.
- Only a 401 on renewal signs the user out; network failures keep the session (offline restore).
- The access token never leaves memory; the refresh token only lives in `secureStorage`.
- Every request: timeout, the caller's abort signal forwarded, exactly one replay after a 401, no
  loops; failures become `AppError` (`network`, `timeout`, `cancelled`, …).
- Breadcrumbs and logs carry the path only: no query string, no body, no token.

**Server state** (`src/features/**/api.ts`, `src/lib/query/**`)

- Server data only through TanStack Query hooks in the feature's `api.ts`, calling `api` with
  `unwrap`/`unwrapWith`; never `fetch` (lint), never copied into Zustand or `useState`.
- `queryFn` passes `signal` to the API call, so unmounts and newer queries cancel the old request.
- Query keys come from the feature's key factory and include every parameter.
- Mutations are never retried automatically (`retry: false`); optimistic updates cancel the
  in-flight queries of that key first (`cancelQueries`), keep a snapshot, roll back on error, and
  invalidate on settle (see `useCreateItem`).
- Only transient errors are retried (`isRetryable`); a 4xx is an answer.

**Screens and navigation** (`src/app/**`, `src/features/**/*.tsx`)

- Routes are thin; protected screens live behind `Stack.Protected` in `src/app/_layout.tsx`.
- Every screen handles loading, empty, error and offline states, and recovers without a restart;
  double taps on submit do not send twice; interrupted flows (backgrounding, lost connection, a
  session expiring while the screen is open) behave.
- Components from `src/ui` only; theme tokens (no color literals); every control with a role and
  accessible name; 48 dp targets; messages that appear without navigation use `AlertText`; every
  new screen is in `src/a11y.spec.tsx`.

**Untrusted input** (`src/lib/links.ts`, `src/app/+native-intent.tsx`, `src/lib/notifications`)

- Links and notification payloads pass the allowlist of `src/lib/links.ts` (query strings dropped,
  ids restricted to `[A-Za-z0-9_-]{1,64}`); a link opens a screen, never performs an action.
- API responses validated with Zod (`unwrapWith`) where the shape matters; route params validated.

**Storage and privacy** (`src/lib/storage/**`, `src/store/**`, SECURITY.md#data-inventory)

- Every key in `STORAGE_KEYS`; credentials in `secureStorage`; nothing sensitive or personal in
  `persistentStorage`; no AsyncStorage.
- New data the app keeps or sends has its row in the data inventory and, if it belongs to the user,
  is cleared at sign-out.
- Stored data from the previous app version still loads (preferences schema, storage keys) or is
  migrated.

**Configuration and native** (`app.config.ts`, `eas.json`, `src/config/**`)

- Configuration read only through `src/config/env.ts`; a new variable in `env.schema.ts`, its line
  in `env.ts`, `.env.example` and docs/RELEASES.md#environment-variables. `EXPO_PUBLIC_*` is
  public: never a secret.
- New permissions declared with their usage text, asked in context, reflected in the store privacy
  declarations (docs/STORE_COMPLIANCE.md).
- `android/` and `ios/` are generated (`expo prebuild`) and never committed.

**Observability** (`src/lib/observability/**`, `src/lib/analytics/**`)

- `reportError()` and `logger`, never `console.log`; redaction (`redact.ts`) not bypassed; no
  tokens, passwords or personal data in logs, breadcrumbs, reports or analytics events.

**Gates and supply chain**

- No threshold (`jest.config.js`), lint rule, budget (`bundle-budget.json`), ignore file, supply-chain
  setting (`pnpm-workspace.yaml`: `minimumReleaseAge`, `trustPolicy`, `allowBuilds`, overrides,
  `audit.ignore`), dependency policy or workflow permission weakened; `nosemgrep` and
  `eslint-disable` carry their reason on the same line.
- Dependencies added with `pnpm exec expo install`, justified; EAS CLI is never a dependency.
- Releases (builds, submissions, OTA updates) only through the manual workflows from `main`.

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
- Changes to `renewOnce`, `generation`, `end()`, `refreshAfterRejection` or the replay in
  `http.ts`.
- A new route that reads params without validation, or a link route without a test in
  `links.spec.ts`.
- `console.*`, string-interpolated errors with user data, analytics events with ids or emails.
- New native dependency or config plugin: store build, prebuild, permissions, privacy manifest.
- Edited `src/api/schema.d.ts` without a matching `openapi/openapi.json` change.
- Tests stubbing with instant responses for a flow whose bug would be a race; tests that only
  assert `toHaveBeenCalled`.

## Release impact

JavaScript-only changes can ship as an OTA update to the same runtime version; anything native
(a module, a config plugin, permissions, native fields of `app.config.ts`, the SDK) needs a store
build and changes the fingerprint runtime version (docs/RELEASES.md). Check the pull request
declares the right one. API changes must stay compatible with app versions already installed, or
be coordinated (docs/RELEASES.md#minimum-supported-version).

## Gates

The plan comes from `doberman.mjs start` (`verify` in `package.json`, plus the CI-only gates of
`template.json`). Notes:

- `pnpm verify` = format, lint, typecheck (contract drift included), tests with coverage
  (accessibility spec included), Expo Doctor, security (audit, dependency policy, secretlint), bundle
  export and budget. Run them one by one so each gets its own result.
- `pnpm test:scripts` (CI only, outside `verify`): the tests of the repository's own scripts (the
  Doberman engine).
- `pnpm sast` and `pnpm lint:workflows` need Docker; `pnpm security` and `pnpm expo:doctor` need the
  network.
- Prebuild writes `android/` and `ios/`: run it in the sandbox only. Never run `pnpm prebuild` (it
  is `--clean`) in the workspace. On Windows, Expo generates `android/` only (it skips iOS there):
  the iOS half is UNVERIFIED unless Docker is available to run the same command in a Linux
  container (`node:24-bookworm-slim`, frozen install, then the prebuild) on a copy of the sandbox.
- gitleaks scans the history: it needs commits. On Windows (Git Bash) the template command needs a
  Windows path for Docker (`commandWindows` in the plan).
- Android E2E (docs/TESTING.md#end-to-end) needs an emulator or device, JDK 17 and Maestro; on
  Windows the native build also needs a short path (`DOBERMAN_TMP=C:\dbm` before `start`) and a
  hoisted `node_modules` in the sandbox (`pnpm_config_node_linker=hoisted`). It is not part of
  "CI passed", but a change to a critical journey should run it.
- iOS builds need macOS with Xcode: elsewhere `SKIPPED — REQUIRES MAC/iOS ENVIRONMENT`.
- `pnpm lint` and `pnpm typecheck` run `expo customize tsconfig.json`; the clean step reports it if
  that rewrote `tsconfig.json`.

## Whole-repository audit order

With `--full` or a repository without commits, review by risk, following the flows instead of
reading every file: session and networking → server state and mutations → sign-out cleanup and
storage → links and notifications → configuration, permissions and native → observability →
screens and accessibility → gates, CI and supply chain → tests (do they prove the above?) → docs
consistency.
