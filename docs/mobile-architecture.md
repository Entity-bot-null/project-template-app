# Mobile architecture

How the app is put together, and the rules that keep it that way. Each section is linked from the
code it describes. The standards for writing code are in
[ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md); performance in
[performance.md](performance.md); builds, updates and store releases in [releases.md](releases.md);
tests in [testing.md](testing.md).

- [Overview](#overview)
- [Layers and dependency rules](#layers-and-dependency-rules)
- [Navigation](#navigation)
- [State](#state)
- [Data fetching](#data-fetching)
- [API](#api)
- [Networking](#networking)
- [Authentication](#authentication)
- [Errors](#errors)
- [Observability](#observability)
- [Storage](#storage)
- [Offline](#offline)
- [Forms](#forms)
- [Design system](#design-system)
- [Deep links](#deep-links)
- [Notifications](#notifications)
- [App lifecycle](#app-lifecycle)
- [Permissions](#permissions)
- [Analytics](#analytics)
- [Feature flags](#feature-flags)
- [Native code](#native-code)
- [Adding a feature](#adding-a-feature)

## Overview

| Concern            | Choice                                                                                       | Where                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Runtime            | React Native with the New Architecture (the only one), Hermes                                | Expo SDK 57                                                           |
| Native projects    | Generated from `apps/mobile/app.config.ts` and config plugins (Continuous Native Generation) | `apps/mobile/android/` and `apps/mobile/ios/` are never committed     |
| Navigation         | Expo Router (file-based, typed routes)                                                       | `apps/mobile/src/app/`                                                |
| Server state       | TanStack Query                                                                               | `apps/mobile/src/lib/query/`, `apps/mobile/src/features/*/api.ts`     |
| Client state       | Zustand, only for state the server does not own                                              | `apps/mobile/src/store/`, `apps/mobile/src/auth/session.ts`           |
| Validation         | Zod: environment, API responses, forms, stored data                                          | next to what it validates                                             |
| Forms              | React Hook Form with the Zod resolver                                                        | `apps/mobile/src/features/*/…Screen.tsx`                              |
| API                | OpenAPI contract, generated types, `openapi-fetch`                                           | `openapi/`, `apps/mobile/src/api/`                                    |
| Storage            | SecureStore (credentials), SQLite key-value (preferences), memory                            | `apps/mobile/src/lib/storage/`                                        |
| Errors and crashes | `AppError` everywhere; Sentry behind an interface                                            | `apps/mobile/src/lib/errors.ts`, `apps/mobile/src/lib/observability/` |
| Styling            | Design tokens, themed `StyleSheet`s, light and dark                                          | `apps/mobile/src/ui/`                                                 |
| Builds and updates | EAS Build, EAS Submit, EAS Update                                                            | `apps/mobile/eas.json`, [releases.md](releases.md)                    |

```
apps/mobile/src/
  app/            routes only (Expo Router): layouts, guards, screens as thin wrappers
  features/       one folder per product area: screens, their API hooks, their components
    auth/ items/ settings/ onboarding/ account/
  api/            the HTTP client, generated contract types, response unwrapping
  auth/           the session: tokens, restore, renewal, sign-out
  config/         public environment, validated
  lib/            app-wide services, no UI: errors, observability, storage, query,
                  links, notifications, permissions, analytics, flags
  store/          client-only state (Zustand): preferences
  ui/             design system: tokens, theme, components
  hooks/          small hooks shared by features
  test/           test setup and helpers (never shipped)
```

## Layers and dependency rules

Imports go one way: `app → features → (api, auth, lib, store, ui, hooks) → config`. ESLint enforces
the rules that matter (`eslint.config.mjs`); a violation fails `pnpm lint`:

| Rule                                                                                                                | Why                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/mobile/src/app/**` may not import `@/api/*` or `@/lib/storage*`                                               | routes compose screens; data access belongs to the feature                     |
| `fetch` only in `apps/mobile/src/api/`                                                                              | every request gets the timeout, request id, token and error handling           |
| `openapi-fetch` only in `apps/mobile/src/api/`                                                                      | one configured client                                                          |
| `@sentry/react-native` only in `apps/mobile/src/lib/observability/sentry.ts`                                        | the provider can be replaced; the scrubbing cannot be bypassed                 |
| `expo-secure-store` and `expo-sqlite/kv-store` only in `apps/mobile/src/lib/storage/`                               | storage is chosen by what the data is, in one place                            |
| React Native's `Text`, `TextInput`, `Button`, `Image` and `Touchable*` only in `apps/mobile/src/ui/`                | accessibility, font scaling and theming come from the design system components |
| Color literals (hex, `rgb()`, `hsl()`, `hwb()`, named colors such as `'white'`) only in `apps/mobile/src/ui/theme/` | dark mode and contrast are guaranteed by the tokens                            |
| `process.env` only in `apps/mobile/src/config/env.ts`                                                               | configuration is validated once                                                |

Each layer named in the table lifts only the import it owns; every other rule still applies to it.
`Pressable` is not restricted: a feature may build a control the design system lacks from it, with
the role and name every control needs (`apps/mobile/src/a11y.spec.tsx`).

A feature never imports another feature's internals. What two features share moves down a layer
(`ui/`, `lib/`, `hooks/`).

## Navigation

Expo Router: every file in `apps/mobile/src/app/` is a route; `_layout.tsx` files define navigators.

```
apps/mobile/src/app/
  _layout.tsx                 providers, startup, the guards below, error boundary
  +native-intent.tsx          filters every incoming link (see Deep links)
  +not-found.tsx
  (onboarding)/welcome.tsx    first launch only
  (auth)/sign-in.tsx          signed out
  (app)/_layout.tsx           signed in: stack, offline banner, notification taps
    (tabs)/_layout.tsx        tabs: index (items), settings
    items/[id].tsx            item detail (the id is validated before use)
    new-item.tsx              form sheet (modal)
```

**Guards, not redirects.** The root layout declares which groups exist for the current state with
`Stack.Protected`:

| State                            | Available group |
| -------------------------------- | --------------- |
| onboarding not completed         | `(onboarding)`  |
| onboarding completed, signed out | `(auth)`        |
| onboarding completed, signed in  | `(app)`         |

When the state changes (sign-in, sign-out, session expired), the router moves to the first available
screen by itself. Screens never navigate to "sign-in" or "home" after an auth event, and no screen
decides who is signed in: they read `useSessionStatus()` and the preferences store, nothing else.

While the session is restoring, the root layout renders nothing and the splash screen stays up: the
user never sees the sign-in screen flash before their session is restored.

**Routes are thin.** A file in `apps/mobile/src/app/` validates its parameters, sets screen options
and renders a screen from `apps/mobile/src/features/`. Route parameters are input from outside (deep
links can carry anything): `items/[id].tsx` checks the id format before any request.

**Typed routes** (`experiments.typedRoutes`): `router.push('/items/[id]')` with a wrong path or
missing parameter is a type error. The types are generated in `apps/mobile/.expo/types` by
`pnpm typecheck` and `pnpm start`.

**Errors in a route** are caught by the `ErrorBoundary` exported from
`apps/mobile/src/app/_layout.tsx`: it reports the error and offers a retry, instead of a white
screen.

## State

Three kinds of state, three homes. Mixing them is the most common source of bugs in mobile apps.

| Kind                          | Examples                                  | Home                                                 |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Server state: the API owns it | items, the user's profile                 | TanStack Query (`apps/mobile/src/features/*/api.ts`) |
| Client state: the app owns it | theme, onboarding done, analytics consent | Zustand (`apps/mobile/src/store/preferences.ts`)     |
| Session                       | signed in or not, why it ended            | Zustand (`apps/mobile/src/auth/session.ts`)          |
| Screen state                  | a text field, a toggle, a search term     | React state in the screen                            |

Rules:

- Server data is never copied into Zustand or React state. A screen reads it from its query; after a
  write, the mutation updates or invalidates the query.
- Zustand stores are small and flat; actions are properties of the store (`usePreferences.getState()
.setTheme('dark')` works outside React). Components select what they need
  (`usePreferences((state) => state.theme)`), so they re-render only when it changes.
- Persisted client state is validated when it is read back (`merge` with a Zod schema in
  `apps/mobile/src/store/preferences.ts`): a value written by an older version of the app, or
  tampered with, falls back to the defaults instead of crashing the app.
- The few values the first frame needs (theme, onboarding) are read synchronously at startup
  (`persistentStorageSync`), so the app never renders with defaults and then flips.

## Data fetching

TanStack Query, configured in `apps/mobile/src/lib/query/queryClient.ts`:

- data is fresh for 30 s, kept 5 minutes after its last screen unmounts;
- only transient failures (network, timeout, 5xx, 429) are retried, twice, with backoff; a 4xx is an
  answer, not a glitch;
- mutations are never retried automatically: a non-idempotent write must not happen twice;
- queries refetch when the app returns to the foreground and when the network comes back
  (`apps/mobile/src/lib/query/network.ts` connects TanStack Query to `AppState` and `expo-network`),
  and pause while offline;
- every query and mutation error reaches `reportError` once (expected errors only leave a
  breadcrumb, see [Errors](#errors)).

Each feature owns its queries in `apps/mobile/src/features/<feature>/api.ts`: query keys
(`itemKeys`), hooks (`useItems`, `useItem`, `useCreateItem`) and the response validation. Screens
call the hooks; they never build requests. `apps/mobile/src/features/items/api.ts` is the reference:

- **keys** are a hierarchy (`['items']`, `['items', 'list', { search }]`,
  `['items', 'detail', id]`), so one `invalidateQueries({ queryKey: itemKeys.all })` refreshes
  everything about items;
- **validation**: every response goes through `unwrapWith(..., ItemSchema)` or `ItemPageSchema`
  (see [API](#api)), so a response that breaks the contract is an error state, not a crash;
- **pagination** is an infinite query (`limit`/`offset`), loaded as the list scrolls;
- **placeholders**: the detail screen starts from the list's copy of the item, then refreshes;
- **optimistic create**: the new item appears at once (marked as saving), is replaced by the
  server's item or removed when the request settles, and the list is refetched.

A mutation can settle after its session ended: the sign-out clears the cache while the request is
on its way, and the next user may already be signed in. Its callbacks then change only what the
mutation itself wrote (the optimistic item, found by its id) and never restore a snapshot of a
query, which would put the previous user's data back into the next user's cache.

## API

`openapi/openapi.json` is the API's contract, generated by the API (`apps/api`) from its controllers
and Zod schemas; `apps/mobile/src/api/schema.d.ts` is generated from it (`pnpm contract` does both)
and committed. The API's drift spec and `pnpm typecheck` fail when they disagree, so a contract
change and the code that depends on it travel in the same pull request. See
[openapi/README.md](../openapi/README.md); the API's side: [architecture.md](architecture.md).

```
apps/mobile/src/api/
  schema.d.ts   generated: paths, operations, components (never edited by hand)
  client.ts     api (authenticated) and publicApi (no token), typed by the contract
  http.ts       the fetch every request goes through (see Networking)
  unwrap.ts     response envelope → data or AppError; Zod validation of the data
```

Responses follow one envelope: `{ data, message }` on success, `{ data: null, message, errors? }` on
failure, with field errors as `[{ path, message }]`. `unwrap()` turns an error status into an
`AppError` of the right kind; `unwrapWith(call, Schema)` also validates `data` with Zod, because the
generated types describe what the server promises, not what reaches the device (an older server, a
proxy, a bug). A response that does not match fails loudly as an error instead of crashing a screen
later.

```ts
const item = await unwrapWith(api.GET('/api/items/{id}', { params: { path: { id } } }), ItemSchema);
```

## Networking

`apps/mobile/src/api/http.ts`, used by both clients:

| Behavior       | Detail                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Timeout        | 15 s per request, as an `AppError` of kind `timeout`                                           |
| Cancellation   | the caller's `AbortSignal` (TanStack Query cancels queries nobody needs) → kind `cancelled`    |
| Request id     | a random `X-Request-Id` on every request: a failure a user reports can be found in server logs |
| Authentication | the session's access token; after a 401, exactly one replay with a renewed token               |
| Errors         | network failures become kind `network`; HTTP statuses are read by `unwrap()` with the body     |
| Breadcrumbs    | method, path (no query string, no body) and status of failures, for error reports              |

Plain HTTP is accepted only for local development hosts (validated by
`apps/mobile/src/config/env.schema.ts`); production requires HTTPS, and Android release builds
refuse cleartext traffic except in the E2E variant (`usesCleartextTraffic`,
`apps/mobile/app.config.ts`).

## Authentication

Provider-agnostic: the app speaks to the API's own endpoints (`/api/auth/sign-in`, `/refresh`,
`/logout`), whatever identity provider is behind them. `apps/mobile/src/auth/session.ts`:

- **access token in memory only**, renewed 30 s before it expires or after a 401;
- **refresh token in secure storage** (Keychain / Keystore), rotated by every renewal: the old one
  stops working (the server must enforce single use);
- **one renewal at a time**: concurrent requests share it; a request that got a 401 after someone
  else renewed reuses the new token instead of renewing again;
- **no resurrection**: a renewal that completes after a sign-out or a new sign-in is discarded and
  its tokens revoked;
- **no crossing sessions**: a request still in flight when its session ended can be answered 401
  after another user signed in. The session recognizes the tokens it issued: a 401 for any other
  token is returned as it is, never replayed with the current token, and neither renews nor ends
  the current session (a sign-out stays a sign-out, not "Your session has ended");
- **offline at launch**, a stored session stays signed in; the first request renews it when the
  network is back. Only the server ending the session (401 on renewal) signs the user out, and the
  sign-in screen says why;
- **fresh install**: the iOS Keychain survives an uninstall, so a session left there by a previous
  installation is deleted at the first launch (an installation marker kept in app storage, which an
  uninstall does wipe). The marker is written only once that session is gone; while the marker
  cannot be read or written (a full disk, a corrupted database) the stored session is not used and
  the user signs in, so a storage failure never holds the app on its splash screen;
- **sign-out** ends the session on the device at once (token deleted, caches cleared, error
  reporting and analytics forget the user) and on the server when reachable.

Credentials typed by the user go to the API and nowhere else: never logged, never stored, never in
an error report. See [SECURITY.md](../SECURITY.md#storage).

**Replacing the provider.** For an OAuth/OIDC provider with its own sign-in page, use
`expo-auth-session` (system browser, PKCE) to obtain the provider's tokens, then exchange them with
the API or keep the same session contract (`Tokens` in `apps/mobile/src/auth/schemas.ts`). Biometric
unlock, if needed, gates access to the stored refresh token (`requireAuthentication` in
SecureStore); it is not a second factor by itself.

## Errors

One error type, `AppError` (`apps/mobile/src/lib/errors.ts`), with a `kind`:

| Kind              | From                         | Retried          | Sent to Sentry  | The user sees (`userMessage`)                      |
| ----------------- | ---------------------------- | ---------------- | --------------- | -------------------------------------------------- |
| `network`         | no answer: offline, DNS, TLS | yes              | breadcrumb only | "You seem to be offline…"                          |
| `timeout`         | 15 s without an answer       | yes              | breadcrumb only | "The server is taking too long to answer…"         |
| `cancelled`       | the request was abandoned    | no               | breadcrumb only | nothing (the screen is gone)                       |
| `unauthenticated` | 401 after the one replay     | no               | breadcrumb only | the sign-in screen, with "Your session has ended…" |
| `forbidden`       | 403                          | no               | breadcrumb only | "You do not have access to this."                  |
| `notFound`        | 404                          | no               | breadcrumb only | "This item no longer exists."                      |
| `validation`      | 400, 422 (with field errors) | no               | breadcrumb only | the message under each field                       |
| `conflict`        | 409                          | no               | breadcrumb only | "This was changed elsewhere…"                      |
| `rateLimited`     | 429                          | yes              | breadcrumb only | "Too many attempts…"                               |
| `server`          | 5xx                          | yes (except 501) | yes             | "Something went wrong on our side…"                |
| `unknown`         | anything else: bugs          | no               | yes             | "Something went wrong. Try again."                 |

The path of an error: technical failure → `toAppError()` (normalized) → `userMessage()` (what the
user reads, never a stack trace or a server message that was not meant for users) →
`reportError()` (Sentry for unexpected errors, a breadcrumb for expected ones, redacted either way).
Screens show `ErrorState` with a retry, or field errors in forms.

## Observability

`apps/mobile/src/lib/observability/`, decoupled from the provider:

- `errorReporter.ts`: the interface the app uses (`reportError`, `addBreadcrumb`, and
  `errorReporter().setUser(id)` with an opaque id, `null` at sign-out). Disabled when no DSN is
  configured: development and tests send nothing.
- `sentry.ts`: the Sentry implementation, the only file importing `@sentry/react-native`. Crashes
  (JavaScript and native), unhandled promise rejections, breadcrumbs, the release and dist of the
  native build (version and build number), the environment, and the OTA update id and channel as
  tags (`update.id`, `update.channel`), so an error can be traced to the exact update that caused
  it.
- `redact.ts`: what leaves the device is scrubbed: keys such as `password`, `token`,
  `authorization`, `cookie`, `secret` are replaced, emails and bearer tokens in text are masked,
  URLs lose their query strings. Error events, breadcrumbs and, with tracing on
  (`EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` above 0), transactions and their spans pass through it.
  `sendDefaultPii` is off, screenshots and view hierarchies are not attached, and failed HTTP
  requests are not captured with their bodies.
- `logger.ts`: `logger.info/warn/error`, printed in development and kept as breadcrumbs. There is no
  `console.log` in app code (lint rule).

Source maps and native debug symbols are uploaded during EAS builds when `SENTRY_ORG`,
`SENTRY_PROJECT` and the secret `SENTRY_AUTH_TOKEN` are set as EAS environment variables, and for
OTA updates by the EAS update workflow ([releases.md](releases.md#environment-variables)).

To use another provider, implement `ErrorReporter` and install it in `startObservability()`.

## Storage

One interface (`KeyValueStorage`, `apps/mobile/src/lib/storage/types.ts`), three implementations
chosen by what the data is:

| Storage             | Backed by                                       | For                                          |
| ------------------- | ----------------------------------------------- | -------------------------------------------- |
| `secureStorage`     | Keychain (iOS) / Keystore-encrypted (Android)   | credentials: the refresh token, nothing else |
| `persistentStorage` | SQLite key-value store (`expo-sqlite/kv-store`) | preferences, flags, non-sensitive state      |
| `memoryStorage`     | process memory                                  | what must not survive a restart              |

- Keys are declared once, in `STORAGE_KEYS` (`apps/mobile/src/lib/storage/index.ts`).
- Values are strings; structured values go through `readJson(storage, key, Schema)` /
  `writeJson()`, which validate on the way back.
- SecureStore items are readable after the first unlock and never leave the device
  (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: excluded from backups and device migration).
- Nothing sensitive goes into `persistentStorage`: it is private to the app but not encrypted.
  AsyncStorage is not used at all.

## Offline

The template is **offline-aware**, not offline-first: it behaves correctly without a connection,
and leaves storing and synchronizing server data offline to the products that need it. Each
capability is classified as in [production-readiness.md](production-readiness.md#classification).

**CORE** (in the template, tested):

| Capability                   | Behavior                                                                                                                                                    | Where                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Network awareness            | TanStack Query knows when the device is offline and when the app returns to the foreground                                                                  | `apps/mobile/src/lib/query/network.ts` |
| Offline banner               | says the data shown may be stale; announced by screen readers; below the status bar and the notch, and the headers under it do not pad the status bar again | `OfflineBannerLayout`, `OfflineBanner` |
| Paused and refetched queries | queries do not fail offline: they pause, and refetch when the network returns                                                                               | TanStack Query `onlineManager`         |
| Graceful failures            | a write offline fails at once with "You seem to be offline…", is not retried, keeps what the user typed                                                     | `apps/mobile/src/lib/errors.ts`, forms |
| Offline cold start           | a stored session stays signed in; renewal waits for the network                                                                                             | `apps/mobile/src/auth/session.ts`      |

**OPTIONAL / PROJECT-SPECIFIC** (not included: each depends on the product's data and rules):

| Capability                        | Use it when                                                                                                    | How                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent query cache            | users reopen the app offline and need to **see** the last data (read-only), and it may be minutes or hours old | `@tanstack/query-async-storage-persister` with `persistentStorage`, `PersistQueryClientProvider`, a `buster` per app version, `maxAge`; persist only non-personal queries (`dehydrateOptions.shouldDehydrateQuery`), clear it at sign-out |
| SQLite domain storage             | users **search, filter or browse large sets** offline, or the data has relations                               | `expo-sqlite` tables owned by the feature, schema migrations (`PRAGMA user_version`), filled from the API; TanStack Query reads from the local database                                                                                   |
| Offline mutations (one at a time) | a user may **create or change** something without a connection and expects it to be sent later                 | TanStack Query paused mutations (`networkMode: 'offlineFirst'`, `setMutationDefaults` with the `mutationFn`, `resumePausedMutations()` after the cache is restored)                                                                       |
| Mutation queue with ordering      | several writes depend on each other (create, then edit)                                                        | an outbox table in SQLite, sent in order by one worker                                                                                                                                                                                    |
| Synchronization                   | the device and the server both change the same records                                                         | a sync endpoint (changes since a cursor), applied locally in transactions                                                                                                                                                                 |
| Conflict resolution               | two devices (or a device and the web) change the same record offline                                           | a policy agreed with the backend (below)                                                                                                                                                                                                  |
| Retry after reconnect             | queued writes must reach the server eventually                                                                 | resume on `onlineManager` online and on app start, with backoff and a limit, surfacing permanent failures to the user                                                                                                                     |

**Writing offline is a contract with the backend, not a client feature.** Before queuing any
write, decide and implement on both sides:

- **Idempotency**: every write carries a client-generated key (`Idempotency-Key` header or a client
  id for new records); the server stores it and answers a replay with the first result, so a
  retried request never creates a duplicate.
- **Server support**: the endpoints accept those keys, and creation accepts client-generated ids.
- **Conflict policy**: per record type, what wins when the server's version changed since the
  device read it: last write wins, server wins, field-level merge, or ask the user. The server
  detects it (a version or `updatedAt` precondition, 409 Conflict) and the app has a defined answer
  for each case.
- **Ordering policy**: which writes must reach the server in order (they go through one queue) and
  which are independent.
- **Retry semantics**: which failures are retried (network, timeout, 5xx, 429) and which are
  permanent (4xx: validation, forbidden, conflict) and shown to the user; how long a write may wait;
  what happens to queued writes at sign-out (sent first, or discarded with a warning: never sent
  as the next user).

Without all five, keep writes online-only (the CORE behavior): a clear failure is better than a
silent duplicate or a lost change. `expo-sqlite` is already a dependency, so none of these adds a
native module.

## Forms

React Hook Form with the Zod resolver. The schema is the single description of the form: types,
validation and messages. `apps/mobile/src/features/auth/SignInScreen.tsx` and `NewItemScreen.tsx`
are the references:

- validate on submit, then as the user corrects (React Hook Form's defaults: `mode: 'onSubmit'`,
  `reValidateMode: 'onChange'`);
- normalize input in the schema (`trim()`, lowercase emails), so what is sent is what was validated;
- server field errors (`validation` errors with `details.fieldErrors`) go under their fields with
  `setError`;
  other errors show in an alert-role message above the submit button;
- `TextField` connects label, error and accessibility state; the submit `Button` shows `busy` and is
  disabled while submitting, so a double tap cannot send twice;
- the right keyboard and autofill hints: `keyboardType`, `textContentType`, `autoComplete`,
  `returnKeyType` moving to the next field.

## Design system

`apps/mobile/src/ui/`:

- `theme/tokens.ts`: the palette (placeholders, see [README.md](../README.md#branding)) and semantic
  colors for light and dark (`background`, `surface`, `text`, `textMuted`, `primary`, `onPrimary`,
  `danger`, `border`, …), spacing, radius, sizes (touch target 48), typography (with
  `maxFontSizeMultiplier`, so the largest accessibility sizes stay usable), elevation. The tests
  measure the contrast of every rendered component and screen against WCAG AA in both themes
  ([accessibility.md](accessibility.md#automated-checks)).
- `theme/ThemeProvider.tsx`: resolves the user's choice (system, light, dark), provides the theme,
  sets the status bar, system UI and navigation colors. `createStyles((theme) => StyleSheet)` builds
  themed styles once per theme.
- `components/`: `Text` (variants, tones, heading roles), `Button` (variants, busy, 48 dp targets),
  `TextField`, `Card`, `Icon` (Ionicons, decorative unless labeled), `Screen` (safe areas, keyboard
  avoidance, scrolling), `LoadingState`, `EmptyState`, `ErrorState`, `OfflineBanner` (and
  `OfflineBannerLayout`, which puts a navigator under it: while the banner shows, it takes the top
  inset, so the headers below read a top inset of 0), `PermissionPrompt`.

Screens use these components and theme values only: no color literals, no raw React Native text or
touchables (lint rules). A new component goes into `apps/mobile/src/ui/` when a second feature needs
it, with its accessibility role and states.

Sheets and modals: Expo Router presentations (`formSheet`, `modal`) configured in the layout
(`new-item` is a form sheet). They are routes, so they can be deep-linked and tested like any
screen. A sheet that closes itself when its work is done closes its own route (the `new-item` route
pops itself from its stack), and only while it is still open: the user can dismiss it while the
request is on its way, and `router.back()` at that point would close whatever screen they opened
since.

## Deep links

Three sources reach the same routes: the custom scheme (`templateapp://items/42`), universal links
and Android App Links (`https://<domain>/items/42`, once `APP.linkDomain` is set and the domain
serves `apple-app-site-association` and `assetlinks.json`), and notification payloads.

Every incoming link is untrusted input. `apps/mobile/src/app/+native-intent.tsx` passes it through
`toInternalPath()` (`apps/mobile/src/lib/links.ts`), an allowlist:

| Link path     | Opens                       |
| ------------- | --------------------------- |
| `/`, `/items` | the items list              |
| `/items/<id>` | an item (id format checked) |
| `/settings`   | settings                    |
| anything else | the home screen             |

Query strings are dropped; parameters are validated; a link never performs an action by itself (no
sign-in, payment, deletion or sharing from a URL): it opens a screen where the user decides. A link
to a signed-in screen while signed out lands on the sign-in screen (the guards apply). A link that
starts the app builds the navigation from its URL alone: the `anchor` of
`apps/mobile/src/app/(app)/_layout.tsx` puts the tabs below the screen it opens, so back leads to
the home screen instead of out of the app.

To add a link (password reset, invitation, product page): add its pattern to `ROUTES` in
`apps/mobile/src/lib/links.ts` with a test, then the route. Each route also declares the https path
that opens the app on Android (`appLink`: exact, or a prefix for a route with a parameter): the App
Links intent filter in `apps/mobile/app.config.ts` is built from them (`APP_LINK_PATHS`), and
`links.spec.ts` checks that it opens exactly the paths the allowlist accepts. Add the path to the
domain's `apple-app-site-association` file too.

## Notifications

`apps/mobile/src/lib/notifications/index.ts`, backend-agnostic. The whole lifecycle, and who owns
each part:

| Moment                | Behavior                                                                                                                                                                                      | Status                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Permission            | asked from a screen that explains why (`PermissionPrompt` in Settings), never at launch; `usePermission` tracks undetermined → granted / denied / blocked (blocked opens the system settings) | CORE, tested           |
| Token                 | `getPushToken()`: the Expo push token, or the raw FCM/APNs token for a backend that talks to them directly; nothing on simulators or without an EAS project id                                | CORE, tested           |
| Registration          | `PushTokenRegistrar.register(token)` sends it to the backend: **not wired**, the sample contract has no endpoint; implement it, call it where Settings gets the token and after each sign-in  | REQUIERE CONFIGURACIÓN |
| Token changes         | tokens change (reinstall, backup restore, OS refresh): register again after each sign-in and from `Notifications.addPushTokenListener`                                                        | REQUIERE CONFIGURACIÓN |
| Sign-out              | the backend detaches this device's token from the account (sent with the logout call, or a delete endpoint called before the session ends); the app stores no token itself                    | REQUIERE CONFIGURACIÓN |
| App in the foreground | shown as a banner (`configureNotifications()`); Android channels created there                                                                                                                | CORE                   |
| App in the background | shown by the operating system; a tap brings the app back and the response listener opens the link                                                                                             | CORE                   |
| App killed            | the tap that launched the app is read at startup (`getLastNotificationResponse`)                                                                                                              | CORE, tested           |
| Links                 | `data.url` goes through the deep link allowlist (`apps/mobile/src/lib/links.ts`); anything else is ignored                                                                                    | CORE, tested           |
| Duplicates            | the same notification (by id) is handled once, even when both the launch and the listener report it                                                                                           | CORE, tested           |
| Tap while signed out  | the guards send the user to sign-in; the link is not resumed after signing in (add that if the product needs it)                                                                              | CORE                   |

The backend side of registration (REQUIERE CONFIGURACIÓN), whatever the push provider:

- store **one row per token**, upserted by the token: the same registration twice is one row;
- a token belongs to **one account at a time**: registering it under another account moves it (a
  shared device that changes user);
- an account has **as many tokens as devices**; send to all of them;
- delete a token at **sign-out** and when the push service reports it invalid (Expo push receipts
  `DeviceNotRegistered`, FCM `UNREGISTERED`);
- keep the platform, app version and last registration time, to clean up stale tokens;
- payloads carry what the user should see and an internal `url`, never personal data beyond that
  (lock screens show them).

Credentials, per project: Android needs the Firebase project's `google-services.json` in the build
(the file-type EAS variable `GOOGLE_SERVICES_JSON`, read by `apps/mobile/app.config.ts`; never
committed) and the FCM V1 key on EAS; iOS needs an APNs key on EAS
([releases.md](releases.md#store-and-service-credentials)).

## App lifecycle

What the app does in each situation a phone puts it in, and what proves it:

| Situation                                     | Behavior                                                                                                                              | Verified by                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground → background                       | queries stop refetching; nothing is saved that was not already saved                                                                  | `query.spec.ts` (follows the app state)                                                                                                               |
| Background → foreground                       | stale queries refetch; an access token close to expiry is renewed before the next request                                             | `query.spec.ts`, `session.spec.ts` (renews before expiry)                                                                                             |
| App killed, then opened                       | the session is restored from secure storage; the app starts at its home screen (navigation state is not restored)                     | `session.spec.ts`, Maestro `02-session-survives-restart`                                                                                              |
| Request interrupted (screen left, app killed) | queries are cancelled; a write already sent completes: no half-done state, no navigation once its screen is gone                      | `http.spec.ts` (cancellation), `items.int.spec.tsx`, `navigation.int.spec.tsx`                                                                        |
| Network lost during a request                 | the request fails as `network` within the timeout; queries pause and retry when the network returns; writes fail visibly              | `http.spec.ts` (network error, timeout), `SignInScreen.int.spec.tsx` (offline message), Maestro `01-onboarding-and-sign-in` (no answer), `05-offline` |
| Session expires while in the background       | the next request renews it; if the server refuses, the user is signed out with "Your session has ended"                               | `session.spec.ts` (renewal, refused renewal), Maestro `06-session-ends`                                                                               |
| Notification opens a killed app               | the launching tap is read at startup and its link opened once                                                                         | `notifications.spec.ts`                                                                                                                               |
| Link opens a killed app                       | the session is restored first; the link's screen opens over the home screen, so back stays in the app; signed out, the sign-in screen | `navigation.int.spec.tsx`, Maestro `07-deep-links`, `08-sign-out`                                                                                     |
| Duplicate notification                        | handled once per notification id                                                                                                      | `notifications.spec.ts`                                                                                                                               |
| Cold start offline                            | signed in with the stored session; offline banner; queries wait for the network                                                       | `session.spec.ts` (offline restore), `query.spec.ts`                                                                                                  |
| Low-memory restart (Android process death)    | the same as a killed app: a fresh start with the session restored                                                                     | as above                                                                                                                                              |
| App upgrade (store or OTA)                    | session and preferences carry over; stored data is validated on read                                                                  | [releases.md](releases.md#upgrade-testing) (manual checklist), `preferences.spec.ts`                                                                  |
| Stale persisted state (an older shape)        | values that no longer match the schema are dropped and defaults used                                                                  | `preferences.spec.ts`, `storage.spec.ts` (`readJson`)                                                                                                 |
| Corrupted persisted state                     | an unreadable preferences file, stored session or installation marker is ignored: defaults, or signed out; never a crash              | `preferences.spec.ts` (not even JSON), `session.spec.ts` (cannot be read or written)                                                                  |

A new feature that stores data or keeps work in progress checks itself against this table, and adds
its own rows.

## Permissions

`usePermission(source)` (`apps/mobile/src/lib/permissions/usePermission.ts`) gives one state machine
for every permission: `checking → undetermined | granted | denied | blocked`. `blocked` (the OS will
not ask again) leads to the system settings instead of a request that cannot appear.

Rules: ask only when the user starts the action that needs it; explain the benefit first
(`PermissionPrompt`); work without it where possible; declare only the permissions the app uses
(`android.permissions` and the iOS usage strings in `apps/mobile/app.config.ts`,
`blockedPermissions` for the ones libraries add but the app does not need).

## Analytics

`apps/mobile/src/lib/analytics/`: `track(event, properties)`, `identify(userId)`, `screen(route)`,
`reset()`, behind an `AnalyticsProvider` interface (`types.ts`). Events and their properties are
typed (`AnalyticsEvents`), so an event cannot be sent with the wrong shape.

- Nothing is sent before the user consents (Settings → Usage analytics, stored in preferences);
  consent can be withdrawn at any time, and `reset()` always works.
- Screens are tracked by route pattern (`/items/[id]`), never with ids or personal data
  (`useScreenTracking`).
- `identify()` receives the user's opaque id, never an email or name.
- The template ships a no-op provider (and a console provider for development). A real provider
  (PostHog, Amplitude, Firebase…) is one more implementation in `providers.ts`; review its data
  collection against the stores' privacy declarations (App Store privacy labels, Play data safety).

## Feature flags

`apps/mobile/src/lib/flags/index.ts`: every flag declared with its default and why it exists
(`FLAGS`), read with `isEnabled('newItemForm')`. Values: the defaults, overridden by
`EXPO_PUBLIC_FLAGS` in development and preview builds (a production build with it fails its
configuration check). A remote provider (rollouts, experiments) plugs in as another source in
`resolveFlags()`; none is included, the choice is the project's.

Flags hide unfinished JavaScript features and allow a staged rollout without a store release. They
are not a security boundary: anything shipped in the bundle can be enabled by someone determined.
Remove a flag and its dead branch once the feature is fully released.

## Native code

The app has no hand-maintained native projects: `apps/mobile/android/` and `apps/mobile/ios/` are
generated by `expo prebuild` from `apps/mobile/app.config.ts` and the config plugins of the
installed modules (Continuous Native Generation), and are not committed. Editing them by hand is
lost at the next prebuild.

Order of preference when native functionality is needed:

1. **An Expo SDK module** (`pnpm --filter mobile exec expo install expo-<module>`): versioned with
   the SDK, New Architecture ready, configured through its config plugin.
2. **A maintained community library** that supports the New Architecture (check [React Native
   Directory](https://reactnative.directory)) and ships a config plugin. Install it with
   `pnpm --filter mobile exec expo install` so the version matches the SDK; `pnpm expo:doctor`
   checks it.
3. **A config plugin of your own** (`plugins/with-<name>.ts`, added to `plugins` in
   `apps/mobile/app.config.ts`) when only native configuration is needed: manifest entries,
   Info.plist keys, Gradle properties.
4. **A local Expo module** (`pnpm dlx create-expo-module --local`, in `modules/`) when native code
   is needed: Swift for iOS and Kotlin for Android with the Expo Modules API (typed functions,
   properties, events and native views; New Architecture by default). Keep its JavaScript API small
   and typed, and test the JavaScript side with a mock of the module.

Any of these changes the native fingerprint: it needs a new store build, and cannot ship as an OTA
update ([releases.md](releases.md#what-can-ship-as-an-ota-update)). Development needs a development
build (`pnpm android`, `pnpm ios`, or the `development` EAS profile); Expo Go is not supported by
this template.

## Adding a feature

1. API and contract: add the route, its Zod schemas and tests to `apps/api`
   ([architecture.md](architecture.md), [api-conventions.md](api-conventions.md)), run
   `pnpm contract`, and keep the mock API in step (`apps/mobile/scripts/mock-api.mjs`).
2. `apps/mobile/src/features/<feature>/api.ts`: query keys, Zod schemas of the responses, query and
   mutation hooks.
3. `apps/mobile/src/features/<feature>/<Name>Screen.tsx`: the screen, using `apps/mobile/src/ui`
   components; loading, empty, error and offline states.
4. `apps/mobile/src/app/...`: the route file that renders the screen, its options and parameter
   validation.
5. Tests: the hooks and logic (unit), the screen through the API stub (integration), a Maestro flow
   if it is a critical journey ([testing.md](testing.md)).
6. Deep link, analytics events, feature flag and permissions, if the feature needs them, as above.
