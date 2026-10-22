# Manual

Versión en español: [manual.es.md](manual.es.md). Both versions say the same; a change to one goes
to the other in the same pull request.

How this template works and every command it ships. It explains; to know **what to do next**, in
order, follow the step-by-step guide: [step-by-step.md](step-by-step.md) (Spanish:
[step-by-step.es.md](step-by-step.es.md)). The other pages of `docs/` hold the details.

Conventions: commands run from the project's root; on Windows, in Git Bash. `<angle brackets>` are
values you replace. **REQUIERE CONFIGURACIÓN** marks what only your project can decide or provide.

## Contents

1. [What the template is](#1-what-the-template-is)
2. [Tools](#2-tools)
3. [How the project is organized](#3-how-the-project-is-organized)
4. [Running the app](#4-running-the-app)
5. [Running the API](#5-running-the-api)
6. [Daily development](#6-daily-development)
7. [Tests](#7-tests)
8. [Commits, pushes and pull requests](#8-commits-pushes-and-pull-requests)
9. [Configuration](#9-configuration)
10. [Command reference](#10-command-reference)
11. [CI/CD](#11-cicd)
12. [Builds, stores and OTA updates](#12-builds-stores-and-ota-updates)
13. [Monitoring a released app](#13-monitoring-a-released-app)
14. [Maintenance calendar](#14-maintenance-calendar)
15. [When something fails](#15-when-something-fails)
16. [Appendix](#16-appendix)

## 1. What the template is

A React Native app for Android and iOS built with Expo (SDK 57), ready for store release, and the
HTTP API it talks to. The app: strict TypeScript, file-based navigation with protected route groups,
a typed API client generated from the API's OpenAPI contract, a secure session (refresh token in
the Keychain/Keystore), offline awareness, a design system with light and dark themes, error
reporting, analytics with consent, feature flags, push notification plumbing,
unit/integration/end-to-end tests, and CI/CD with EAS for builds, store submissions and
over-the-air updates. The API (NestJS, PostgreSQL, optional Redis, email through an outbox):
accounts with mobile sessions, sign-up, password recovery, invitations, account deletion, the
example items, a minimum supported app version, rate limits that tell apart the people behind one
carrier address, observability, and its own unit and integration tests.

It contains an **example feature** (sign-in, a paginated searchable list of items, item detail,
item creation, settings) that exercises every layer, in the app and in the API. Build your features next to it and delete it
once yours exist ([step-by-step.md](step-by-step.md#phase-6-make-it-yours)).

What it does not include on purpose, and why: [adr/0001-stack.md](adr/0001-stack.md) and
[SECURITY.md](../SECURITY.md#advanced-device-controls).

## 2. Tools

| Tool           | Version                                                                                        | Used for                                               |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Node.js        | 24.15+ (`.nvmrc`)                                                                              | everything JavaScript                                  |
| pnpm           | 12.5.1 (`packageManager`; `corepack enable`; from Node.js 25, `npm install -g corepack` first) | dependencies and scripts                               |
| Git            | current                                                                                        | version control; the hooks                             |
| Android Studio | current, with the Android SDK, an emulator and **JDK 17**                                      | Android builds and the emulator                        |
| Xcode          | the version the Expo SDK requires (macOS only)                                                 | iOS builds and the simulator                           |
| EAS CLI        | `npm install -g eas-cli` (or `pnpm dlx eas-cli`), run in `apps/mobile`                         | builds, credentials, updates                           |
| Maestro        | 2.10 (the version CI pins)                                                                     | end-to-end flows                                       |
| Docker         | current, with Compose                                                                          | the API's services, `pnpm sast`, `pnpm lint:workflows` |
| GitHub CLI     | current                                                                                        | repository settings, workflows                         |

Windows: native Android builds also need a short project path, Windows long paths and a hoisted
`node_modules` on that machine ([testing.md](testing.md#end-to-end)); WSL 2 or EAS builds avoid
those.

## 3. How the project is organized

A pnpm workspace: the app is the package `mobile` in `apps/mobile`, the API the package `api` in
`apps/api`, the public site the package `landing` in `apps/landing`, and the root holds what applies
to the whole repository. Commands run from the root; `pnpm --filter <package> <script>` runs one of
a package's own scripts.

```
apps/mobile/            the app
  src/app/              routes (Expo Router): layouts, guards, thin screens
  src/features/         product areas: screens and their data hooks (auth, items, settings, onboarding, account)
  src/api/              HTTP client, generated contract types, response unwrapping
  src/auth/             the session: tokens, restore, renewal, sign-out
  src/config/           the validated public configuration (EXPO_PUBLIC_*)
  src/lib/              errors, observability, storage, query, links, notifications, permissions, analytics, flags
  src/store/            client state (Zustand)
  src/ui/               design system: tokens, theme, components
  .maestro/             end-to-end flows
  scripts/              contract types, mock API, bundle budget, expo-doctor, EAS project check
  app.config.ts         identity, build variants, native configuration
  eas.json              build profiles and store submission (EAS runs here)
apps/api/               the API (NestJS)
  src/                  modules: auth, account, invitations, items, users, health; common (guards,
                        pipes, filters, middleware), infrastructure (Redis, cache, locks, rate limits,
                        email outbox), observability, env, prisma, seed, openapi
  prisma/               schema and committed migrations
  test/                 integration test helpers
  Dockerfile            the API image and its migration job
apps/landing/           the public site (Astro), English and Spanish, and the web image
  src/pages/            the pages: home, privacy, account deletion, open-in-app, not found (es/: Spanish)
  src/i18n/             every text, one dictionary per language
  src/lib/              the name and privacy address (site.ts), the store pages (stores.ts)
  public/               favicon.svg, og.png (the picture a shared link shows, 1200 × 630)
  nginx/                the web server: routes, security headers, the app's link files at start
  Dockerfile            the web image
openapi/                the API contract, generated by the API (`pnpm contract`)
observability/          the catalog of the API's metrics
e2e/                    the browser suite (Playwright): the landing, the web image's app links
scripts/                the repository's checks (hooks and CI), `pnpm dev`, the smoke test, pinned tool images
docker-compose.yml      PostgreSQL, Redis and Mailpit for development; the production-like stack
.github/                CI/CD
```

The rules between these folders (enforced by ESLint) and the reasons:
[mobile-architecture.md](mobile-architecture.md) for the app, [architecture.md](architecture.md)
for the API and the site.

**Native code is generated.** `apps/mobile/android/` and `apps/mobile/ios/` are produced by
`expo prebuild` from `apps/mobile/app.config.ts` and never committed or edited by hand.

**Build variants.** One codebase, four variants (`APP_VARIANT`): `development`, `preview`, `e2e`,
`production`, each with its own application id and URL scheme so they install side by side
([releases.md](releases.md#build-variants-and-profiles)).

## 4. Running the app

The app runs as a **development build** (your own app binary with developer tools), not in Expo Go.

| Goal                                                | Commands                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First time on Android                               | `pnpm install`, `cp apps/mobile/.env.example apps/mobile/.env` and in it `EXPO_PUBLIC_API_URL=http://localhost:4010` (it ships pointing at the API, section 5), `pnpm mock:api` (terminal 1), `adb reverse tcp:4010 tcp:4010`, `pnpm android` (terminal 2) |
| First time on iOS (macOS)                           | the same with `pnpm ios` (the simulator reaches `localhost` directly)                                                                                                                                                                                      |
| Every other day                                     | `pnpm mock:api` and `pnpm start`, then open the installed app                                                                                                                                                                                              |
| After a native change                               | `pnpm prebuild`, then `pnpm android` / `pnpm ios` (they regenerate nothing while `apps/mobile/android/` and `apps/mobile/ios/` exist)                                                                                                                      |
| A development build without Android Studio or Xcode | `eas build --profile development --platform android` (or `development-simulator` for the iOS simulator) and install it from the link                                                                                                                       |

The mock API (`apps/mobile/scripts/mock-api.mjs`) implements the contract in memory: accounts
`member@example.com` / `member-password` and `admin@example.com` / `admin-password`, 45 example
items. `MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` makes tokens expire quickly (watch the session renew);
`MOCK_LATENCY_MS=1500` slows every answer (see the loading states). It also fails on demand, to see
an error state: `curl -X POST localhost:4010/__mock/sessions/revoke` ends the session at the app's
next request ([testing.md](testing.md#end-to-end) lists the others). It sends no email: the links it
would send (sign-up, password reset, change of email, invitation) are printed in its terminal with
the development build's scheme and kept at `GET localhost:4010/__mock/outbox`; open one on the
emulator with `adb shell am start -a android.intent.action.VIEW -d '<link>'`.

In the running app: `r` in the `pnpm start` terminal reloads, `j` opens React Native DevTools, `m`
opens the developer menu on the device.

## 5. Running the API

The API runs on your machine against PostgreSQL, Redis and Mailpit in Docker. The app keeps working
against the mock API (section 4) until you point it here.

### 5.1 First time

```sh
cp .env.example .env                     # the ports Docker Compose publishes (defaults are fine)
cp apps/api/.env.example apps/api/.env   # the API's settings; set JWT_ACCESS_SECRET:
openssl rand -hex 32                     #   paste the output as JWT_ACCESS_SECRET
pnpm services:up                         # PostgreSQL, Redis and Mailpit, healthy
pnpm db:migrate                          # the committed migrations
pnpm db:seed                             # the example accounts and the member's 45 items
pnpm dev                                 # the API in watch mode, and a box with every address
```

| What                    | Where                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| The API                 | `http://127.0.0.1:3010/api` (`/api/health/ready` says ready)                     |
| Its documentation       | `http://127.0.0.1:3010/api/docs` (Swagger UI, not production)                    |
| PostgreSQL              | `localhost:5452`, database `app`                                                 |
| Redis                   | `localhost:6399`                                                                 |
| Mailpit (every message) | `http://localhost:8045`                                                          |
| Seed accounts           | `member@example.com` / `member-password`, `admin@example.com` / `admin-password` |

The ports are the web template's plus 10, so both run on one machine. A port taken by another
project: change it in the root `.env` and the matching URL in `apps/api/.env` (`pnpm dev` points
out a mismatch). `pnpm db:down` stops the services; their data stays in Docker volumes.

### 5.2 Pointing the app at the API

In `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://localhost:3010`; on the Android emulator also
`adb reverse tcp:3010 tcp:3010` (the iOS simulator reaches `localhost` directly). Then
`pnpm start` again, and sign in with a seed account. Back to the mock API: `http://localhost:4010`.

### 5.3 Email

Locally every message lands in Mailpit (`http://localhost:8045`), nothing leaves the machine:
sign-up confirmations, password resets, email changes, invitations and the security notices
(password changed, account deleted). Without `MAIL_SMTP_URL` email is off and the routes that need
it answer 503 (`GET /api/auth/capabilities` tells a client which are available). The outbox's commands:

```sh
pnpm --filter api mail test --to you@example.com   # queue a test message and wait for it
pnpm --filter api mail status [--to <address>]     # the queue, or one address's messages
pnpm --filter api mail retry --id <id> | --failed  # send failed messages again
```

The links in those messages (`<APP_ORIGIN>/app/<screen>#token=…`) open the app's screens on a phone
once `APP.linkDomain` is that domain ([mobile-architecture.md](mobile-architecture.md#deep-links)).
A development build claims no domain: open the link with its scheme instead, keeping the screen and
the fragment, `adb shell am start -a android.intent.action.VIEW -d 'templateapp-dev://reset-password#token=…'`
(`xcrun simctl openurl booted '…'` on the iOS simulator).

A real SMTP server, the sender and the limits: [environment.md](environment.md), and how the
outbox works: [architecture.md](architecture.md#email).

### 5.4 Optional infrastructure

| Piece           | On with                                                                                                                                      | Without it                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Redis           | `REDIS_URL` (set in `apps/api/.env.example`), `RATE_LIMIT_STORE` and `CACHE_STORE` = `redis`                                                 | in-process rate limits, cache and locks (one instance) |
| Sentry          | `SENTRY_DSN`                                                                                                                                 | errors in the logs only                                |
| OpenTelemetry   | `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                                                                | no traces or metrics exported                          |
| A local backend | `docker compose --profile observability up -d`, then `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4328`; Grafana at `http://localhost:3011` | —                                                      |

Details: [architecture.md](architecture.md#optional-infrastructure) and
[observability.md](observability.md).

### 5.5 The production-like stack

`docker compose --profile stack up --build` builds the API image, its migration job and the web
image from their Dockerfiles, applies the migrations and serves everything at
`http://localhost:8090`: the landing, the app's links, and the API at `/api`, with production
settings and Redis (needs `JWT_ACCESS_SECRET` in the root `.env`). `pnpm smoke --url
http://localhost:8090` checks it. To try the app's
update screen, start it with `STACK_MOBILE_MIN_VERSION_ANDROID=99.0.0` (or `_IOS`): every request
from the app then answers 426. Not a deployment: no TLS, local credentials, loopback only.

### 5.6 Accounts and administrators

The seed's accounts are for development only (`pnpm db:seed` refuses production and remote
databases). Anywhere else, create an account with its password on standard input:

```sh
printf '%s' "$PASSWORD" | pnpm --filter api user:create --email <email> --name <name> --role admin
```

That is the way to the first administrator: public sign-up (`SIGN_UP_ENABLED`, off by default)
only ever creates members, and administrators invite the rest. An account is deleted by its owner,
with its password (`POST /api/account/deletion`), and everything it owns with it; the only administrator cannot
delete theirs ([adr/0012-account-deletion.md](adr/0012-account-deletion.md)).

### 5.7 The landing

The public site: the home page (what the app is, how it works, where to download it), privacy,
account deletion (the URL Google Play's Data safety form asks for), and the page the app's links
show where the app does not open them, in English (`/`) and Spanish (`/es/`). `pnpm dev` serves it
at `http://localhost:4331`, with `/api` forwarded to the API; `pnpm --filter landing build` then
`pnpm --filter landing preview` show the built pages.

What a product changes (REQUIERE CONFIGURACIÓN):

| What                                 | Where                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| The name                             | `apps/landing/src/lib/site.ts` (`SITE_NAME`), the same as `APP.name` in `apps/mobile/app.config.ts`                 |
| The address for privacy and deletion | `apps/landing/src/lib/site.ts` (`PRIVACY_EMAIL`): someone must read it                                              |
| The store pages (badges)             | `apps/landing/src/lib/stores.ts` once the listings exist; empty, the badges stay hidden                             |
| The texts                            | `apps/landing/src/i18n/en.ts` and `es.ts`, in the same change (a missing text fails the build)                      |
| The privacy policy                   | `privacy` in both dictionaries: the legal text, the providers, the retention periods; then drop its template notice |
| The picture and the icon             | `apps/landing/public/og.png` (1200 × 630) and `favicon.svg`                                                         |
| The colors and type                  | `apps/landing/src/styles/global.css` (light and dark)                                                               |

Served by the web image, the links of the API's emails (`/app/<screen>#token=…`) open in the app
once the domain proves it is the app's: set the app's identity on the image (`APPLE_TEAM_ID`,
`IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`,
[environment.md](environment.md#web-variables)) and the same domain in `APP.linkDomain`. Without
them, a link shows the open-in-app page. Details: [architecture.md](architecture.md#public-site-and-app-links-appslanding).

### 5.8 The server

The server side (the API and the web image) ships to one Linux server with Docker, the reference
target ([deploy-vps.md](deploy-vps.md), [ADR 0009](adr/0009-postgresql-and-redis-on-the-server.md)):
Caddy for TLS, the web image, the API, PostgreSQL with a nightly backup (or a managed one) and
Redis, from `deploy/vps/`. The **Deploy** workflow, started by a person, publishes the images once
per commit, checks the server's files, migrates, rolls out, runs the smoke test and rolls back by
itself; staging first, then the same commit to production. On DigitalOcean, Terraform builds the
server (`infra/terraform/digitalocean`). The app's builds point at it: the `preview` builds at
staging, the `production` builds at production, and its domain is the app's link domain.

| What                  | Where                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Set up a server       | [deploy-vps.md](deploy-vps.md), step by step in [step-by-step.md](step-by-step.md#phase-7-the-server-the-api-and-the-public-site) |
| Deploy, roll back     | [deploy-vps.md](deploy-vps.md#operations), [ci-cd.md](ci-cd.md#deployment)                                                        |
| Backups and restores  | [deploy-vps.md](deploy-vps.md#backups), [disaster-recovery.md](disaster-recovery.md)                                              |
| Dashboards and alerts | `observability/` ([observability.md](observability.md#dashboards-and-alerts-as-code), [alerting.md](alerting.md))                 |
| When an alert fires   | [incident-response.md](incident-response.md)                                                                                      |

`pnpm iac:check` and `pnpm observability:check` check the server's code locally (Docker), as CI
does.

## 6. Daily development

1. `git switch main && git pull`, then `pnpm install` when the lockfile changed.
2. A branch: `git switch -c feat/<description>` (types: `feat`, `fix`, `chore`, `docs`,
   `refactor`, `test`, `ci`, `build`, `perf`, `hotfix`, `release`).
3. The change, following the recipe of
   [mobile-architecture.md](mobile-architecture.md#adding-a-feature): API (schema, route, tests) →
   contract → data hooks → screen → route → tests.
4. API contract changes start in the API (its Zod schemas and controllers); `pnpm contract`
   regenerates `openapi/openapi.json` and `apps/mobile/src/api/schema.d.ts`: commit both
   ([openapi/README.md](../openapi/README.md)). Changes stay additive: installed apps keep the old
   contract ([api-conventions.md](api-conventions.md)).
5. Database changes: edit `apps/api/prisma/schema.prisma`, then `pnpm db:migrate` creates the
   migration; commit it, never edit an applied one ([database.md](database.md#migrations)).
6. A dependency: for the app, `pnpm --filter mobile exec expo install <package>` (never `pnpm add`
   for anything that touches native code); for the API, `pnpm --filter api add <package>`; explain
   it in the pull request ([CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-dependency)).
7. Before pushing: `pnpm verify`, and `pnpm test:integration` when the API changed.

## 7. Tests

| Kind                                          | Command                                                                                       | Where                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| App: unit, component, integration             | `pnpm test` (both packages)                                                                   | `apps/mobile/src/**/*.spec.ts(x)`, `*.int.spec.tsx` |
| API: unit (no database)                       | `pnpm test`                                                                                   | `apps/api/src/**/*.spec.ts`                         |
| API: integration (PostgreSQL, Redis, Mailpit) | `pnpm test:integration` (the services up: `pnpm services:up`)                                 | `apps/api/src/**/*.int.spec.ts`, on `app_test`      |
| Landing: dictionaries, pages, helpers         | `pnpm test` (Vitest)                                                                          | `apps/landing/src/**/*.spec.ts`                     |
| With coverage and thresholds                  | `pnpm test:coverage`                                                                          | `apps/*/coverage/`                                  |
| Watch mode                                    | `pnpm --filter mobile test:watch`, `pnpm --filter api test:watch`                             |                                                     |
| One folder or test                            | `pnpm --filter mobile test features/items`, `pnpm --filter api exec vitest run src/items`     |                                                     |
| End-to-end on a device                        | `pnpm test:e2e:mobile` (a release build of the `e2e` variant installed, the mock API running) | `apps/mobile/.maestro/flows/`                       |
| End-to-end against the API and Mailpit        | `pnpm test:e2e:mobile:stack` (the same build, `pnpm dev`, `adb reverse tcp:4010 tcp:3010`)    | `apps/mobile/.maestro/stack/`                       |
| Browser: the landing and the web image        | `pnpm test:e2e` (after `pnpm --filter landing build`; Docker for the image)                   | `e2e/`                                              |
| A deployment, or the stack                    | `pnpm smoke --url <public URL> --api <API URL>` (read-only)                                   | `scripts/smoke-test.mjs`                            |

How to write them and the helpers: [testing.md](testing.md).

## 8. Commits, pushes and pull requests

- Commit messages and pull request titles follow Conventional Commits:
  `feat(items): share an item` ([CONTRIBUTING.md](../CONTRIBUTING.md#commits)).
- Hooks: `pre-commit` (staged files: no `.env`, secret scan, lint with fixes, format),
  `commit-msg` (commitlint), `pre-push` (no pushes to `main`, branch name, `pnpm typecheck`,
  `pnpm test`).
- Pull requests use the template: what and why, how it was tested on devices, screenshots, the
  release impact (OTA update or new store build) and the Definition of Done.
- Merge with **Squash and merge** once **CI passed** and **Conventions** are green and a reviewer
  approved.

## 9. Configuration

| Where                                       | What                                                                                                       | Committed |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| `apps/mobile/app.config.ts` → `APP`         | name, slug, identifier, URL scheme, EAS project id and owner, link domain, colors (REQUIERE CONFIGURACIÓN) | yes       |
| `apps/mobile/.env`                          | local public configuration (`EXPO_PUBLIC_*`)                                                               | never     |
| `apps/mobile/.env.example`                  | documentation of every variable                                                                            | yes       |
| `apps/api/.env`                             | the API's local settings (database, secrets, email, Redis, limits)                                         | never     |
| `apps/api/.env.example`                     | documentation of every API variable                                                                        | yes       |
| `.env` (root)                               | the ports and settings Docker Compose reads (`.env.example`)                                               | never     |
| `apps/mobile/eas.json`                      | build profiles: variant, environment, channel, distribution; submission                                    | yes       |
| EAS environment variables                   | per environment: API URL, Sentry DSN, `SENTRY_*` (build time)                                              | on EAS    |
| GitHub environments `preview`, `production` | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`                                                                          | on GitHub |

Every `EXPO_PUBLIC_*` value is compiled into the app and readable by anyone: never a secret.
`apps/mobile/src/config/env.schema.ts` validates them when the app config is evaluated (a bad value
fails the build) and at startup. The full table: [releases.md](releases.md#environment-variables).
The API reads its variables only in `apps/api/src/env/env.ts` and refuses to boot with an invalid
one, naming it; every variable, its default and rules: [environment.md](environment.md).

## 10. Command reference

| Command                                           | Does                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                    | dependencies; installs the Git hooks, generates Expo's types and the Prisma client                                                                                                                                                                                                        |
| `pnpm dev`                                        | `pnpm services:up`, then the API in watch mode, the landing on `localhost:4331`, and a box with their addresses                                                                                                                                                                           |
| `pnpm services:up`                                | PostgreSQL, Redis and Mailpit in Docker, waiting until healthy                                                                                                                                                                                                                            |
| `pnpm db:up` / `pnpm db:down`                     | PostgreSQL alone / stop every service (the data stays)                                                                                                                                                                                                                                    |
| `pnpm db:migrate`                                 | create a migration from `schema.prisma` changes, apply pending ones, regenerate the client                                                                                                                                                                                                |
| `pnpm db:seed`                                    | the example accounts and items (local databases only)                                                                                                                                                                                                                                     |
| `pnpm start`                                      | Metro dev server for an installed development build                                                                                                                                                                                                                                       |
| `pnpm android` / `pnpm ios`                       | compile, install and run a development build locally                                                                                                                                                                                                                                      |
| `pnpm prebuild`                                   | regenerate `apps/mobile/android/` and `apps/mobile/ios/`                                                                                                                                                                                                                                  |
| `pnpm mock:api`                                   | the mock API on `127.0.0.1:4010`                                                                                                                                                                                                                                                          |
| `pnpm --filter mobile types:generate`             | Expo's generated types (`apps/mobile/expo-env.d.ts`, typed routes)                                                                                                                                                                                                                        |
| `pnpm lint` / `pnpm lint:fix`                     | ESLint, zero warnings                                                                                                                                                                                                                                                                     |
| `pnpm format` / `pnpm format:check`               | Prettier                                                                                                                                                                                                                                                                                  |
| `pnpm typecheck`                                  | contract drift, generated types, `tsc`                                                                                                                                                                                                                                                    |
| `pnpm test` / `pnpm test:coverage`                | Jest (app) and Vitest (API unit, landing); `pnpm --filter <package> test:watch` to watch                                                                                                                                                                                                  |
| `pnpm test:integration`                           | the API's integration suite against PostgreSQL, Redis and Mailpit                                                                                                                                                                                                                         |
| `pnpm test:e2e`                                   | Playwright: the built landing, and the web image's app links (builds and runs the image: Docker)                                                                                                                                                                                          |
| `pnpm test:e2e:mobile`                            | Maestro flows                                                                                                                                                                                                                                                                             |
| `pnpm test:e2e:mobile:stack`                      | Maestro flows against the real API and Mailpit (sign-up, change of email, password recovery, account deletion)                                                                                                                                                                            |
| `pnpm test:scripts`                               | the tests of the repository scripts (`scripts/*.test.mjs` and `apps/*/scripts/*.test.mjs`: Doberman's engine, the dependency policy, the tool images, the mock API against the contract, the web image's scripts, the deployment scripts and the server's files, the observability files) |
| `pnpm expo:doctor`                                | expo-doctor, every check; dependency versions against the installed SDK's manifest (the lockfile), not the newest published patches                                                                                                                                                       |
| `pnpm security`                                   | `pnpm audit` (high), dependency and license policy, secret scan                                                                                                                                                                                                                           |
| `pnpm deps:check` / `pnpm secrets:scan`           | the two policies separately                                                                                                                                                                                                                                                               |
| `pnpm sast`                                       | Semgrep (Docker)                                                                                                                                                                                                                                                                          |
| `pnpm lint:workflows`                             | actionlint, zizmor, shellcheck (Docker)                                                                                                                                                                                                                                                   |
| `pnpm contract`                                   | `openapi/openapi.json` from the API, then `apps/mobile/src/api/schema.d.ts` from it                                                                                                                                                                                                       |
| `pnpm build`                                      | the API (`apps/api/dist/`), the landing (`apps/landing/dist/`) and the app's production JavaScript bundles of both platforms (`apps/mobile/dist/`)                                                                                                                                        |
| `pnpm perf:check`                                 | the landing's and the app's budgets, after `pnpm build`                                                                                                                                                                                                                                   |
| `pnpm smoke`                                      | the read-only smoke test of a deployment or the stack (`--url`, `--api`, `--release`, `--require-app-links`)                                                                                                                                                                              |
| `pnpm iac:check`                                  | Terraform (fmt, validate, tests), TFLint, Trivy, cloud-init, the database roles and `db-init.sh` on PostgreSQL (Docker)                                                                                                                                                                   |
| `pnpm iac:database`                               | the managed database's roles, from the server Terraform built (section 5.8)                                                                                                                                                                                                               |
| `pnpm observability:check`                        | the dashboards and alert rules against the metric catalog and the runbooks, then promtool and the rules' unit tests (Docker)                                                                                                                                                              |
| `pnpm --filter landing dev` / `build` / `preview` | the landing alone: its dev server, its build (`astro check` first), the built pages                                                                                                                                                                                                       |
| `pnpm sbom:generate`                              | CycloneDX SBOM of the production dependencies                                                                                                                                                                                                                                             |
| `pnpm verify`                                     | format, lint, typecheck, coverage, expo-doctor, security, build, budgets                                                                                                                                                                                                                  |
| `pnpm --filter api user:create`                   | an account, its password from standard input (section 5.6)                                                                                                                                                                                                                                |
| `pnpm --filter api mail <command>`                | the email outbox: `test`, `status`, `retry` (section 5.3)                                                                                                                                                                                                                                 |
| `docker compose --profile stack up --build`       | the production-like stack on `localhost:8090`: the web image in front of the API (section 5.5)                                                                                                                                                                                            |

EAS (global CLI, `eas <command>`): `login`, `init`, `build`, `build:list`, `submit`, `update`,
`update:list`, `update:edit`, `update:republish`, `update:roll-back-to-embedded`, `channel:list`,
`channel:protect`, `credentials`, `env:create`, `env:list`, `device:create`, `fingerprint:compare`.

## 11. CI/CD

| Workflow      | When                                               | Does                                                                                                                                                                                      |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI            | every pull request and push to `main`              | every gate (format, lint, types, doctor, SAST, tests, the API's integration suite, security, build and bundle, prebuild, the API images built and scanned); required check: **CI passed** |
| Conventions   | every pull request, again when its title is edited | branch name and title (Conventional Commits); required check: **Conventions**                                                                                                             |
| E2E (Android) | pull requests and pushes that touch the app        | release APK of the `e2e` variant, mock API, emulator, Maestro                                                                                                                             |
| Release       | push to `main`                                     | the release pull request and CI on it; on merge, the tag and the GitHub release with the SBOM                                                                                             |
| EAS build     | by hand, from `main`                               | gates, then an EAS build of `preview` or `production` (optional submission to internal testing)                                                                                           |
| EAS update    | by hand, from `main`                               | gates, then an OTA update to `preview` or `production`, optionally staged                                                                                                                 |
| EAS rollback  | by hand, from `main`                               | republish an earlier update or go back to the embedded bundle                                                                                                                             |
| CodeQL        | opt-in                                             | security analysis                                                                                                                                                                         |
| Deploy        | by hand, from `main`                               | gates, then the server side to `staging` or `production`: images, migration, rollout, smoke test, rollback (section 5.8)                                                                  |
| DAST          | weekly, by hand                                    | OWASP ZAP on the production images started on the runner, or a passive scan of staging; advisory                                                                                          |

No pull request can build, sign, submit or publish: [ci-cd.md](ci-cd.md#what-protects-production).

## 12. Builds, stores and OTA updates

- **Versions:** `apps/mobile/package.json` holds the version users see (release-please bumps it,
  with the root `package.json`: one version for the whole repository); EAS
  increments the build numbers of production builds.
- **Builds:** development builds by developers; `preview` and `production` through the EAS build
  workflow from a commit on `main` (production: a release tag).
- **Stores:** production builds go to Google Play's internal track (as a draft) and TestFlight;
  releasing to the public is done in Play Console and App Store Connect, with a staged or phased
  rollout.
- **OTA updates:** JavaScript and assets reach installed builds of the same runtime version
  (native fingerprint) without a store release; native changes always need a new build.
- **Rollback:** an OTA update is rolled back by republishing an earlier one or going back to the
  embedded bundle; a store release is halted in the store and fixed with an update or a new build.

All of it in detail: [releases.md](releases.md).

## 13. Monitoring a released app

- **Sentry** (when `EXPO_PUBLIC_SENTRY_DSN` is set): crashes and errors with the release, build,
  update id and channel; source maps uploaded by builds and by the EAS update workflow.
- **The stores:** Play Console → Android vitals (crashes, ANRs); App Store Connect / Xcode
  Organizer (crashes, energy, hangs); ratings and reviews.
- **EAS:** `eas update:insights`, `eas channel:insights` (adoption and crash rates per update).
- **Settings → About** in the app shows the version, build and update a user runs: ask for it in
  bug reports.
- **The server:** the dashboards and alert rules of `observability/` in the chosen backend, the
  uptime checks (`/healthz`, the API, the app's link files), and the runbooks of
  [incident-response.md](incident-response.md), one per alert ([alerting.md](alerting.md)).
  `ApiClientsRefusedAsOutdated` warns when a minimum version locks most installs of a platform out.

## 14. Maintenance calendar

| When                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every week                          | Approve Dependabot's pull requests: patch and minor updates merge themselves once CI is green; majors and workflow updates you merge by hand ([ci-cd.md](ci-cd.md#dependency-updates)).                                                                                                                                                                                                                                                                                          |
| Every release                       | Preview build, test on devices, production build, internal testing, staged store rollout.                                                                                                                                                                                                                                                                                                                                                                                        |
| Every Expo SDK (about three a year) | Upgrade one SDK at a time ([releases.md](releases.md#expo-sdk-upgrades)).                                                                                                                                                                                                                                                                                                                                                                                                        |
| Every quarter                       | Check the audit exceptions (`audit.ignore`) and security `overrides` of `pnpm-workspace.yaml` (remove an override once `pnpm why <package>` shows a fixed version without it); the pinned EAS CLI, Maestro, Node.js and pnpm versions, and TypeScript ([ci-cd.md](ci-cd.md#keeping-the-stack-current)); credentials that expire (the Apple distribution certificate lasts a year: renew it with `eas credentials` before it does, or the production workflow's iOS build fails). |
| Before store deadlines              | Google Play's target API level requirement (each August) and Apple's minimum Xcode/SDK requirement (each spring): new SDK builds meet them.                                                                                                                                                                                                                                                                                                                                      |
| PostgreSQL or Redis major           | By hand, with `docker-compose.yml`, the server's `deploy/vps/compose.yaml` and the CI images (`scripts/tool-images/Dockerfile`); a PostgreSQL data directory is dumped and restored across majors ([ci-cd.md](ci-cd.md#postgresql-and-redis)).                                                                                                                                                                                                                                   |
| Every month (the server)            | Remove old images on the server, keeping the running release and the rollback target; reboot it when `/var/run/reboot-required` exists ([deploy-vps.md](deploy-vps.md#keep-the-server-healthy)).                                                                                                                                                                                                                                                                                 |
| Every quarter (the server)          | A restore drill of the database ([disaster-recovery.md](disaster-recovery.md#restore-testing)), a test alert through the routing ([alerting.md](alerting.md#escalation-requiere-configuración)), and the copy of the backups off the server checked.                                                                                                                                                                                                                             |

## 15. When something fails

The README has a troubleshooting table ([README.md](../README.md#troubleshooting)); the end-to-end
specifics are in [testing.md](testing.md#end-to-end); the server's messages (the web image, the
deployment, its checks) in [troubleshooting.md](troubleshooting.md), and what to do when
production misbehaves in [incident-response.md](incident-response.md). The most common:

| Message                                                                        | Fix                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| "You seem to be offline" on the Android emulator                               | `adb reverse tcp:4010 tcp:4010`                                                                        |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…`                              | set it (`apps/mobile/.env` locally, EAS environment for builds); HTTPS outside localhost               |
| `pnpm expo:doctor` reports versions                                            | `EXPO_OFFLINE=1 pnpm --filter mobile exec expo install --fix` (the versions the installed SDK expects) |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`                                          | a release younger than seven days: use the previous one or wait                                        |
| Android build: "A restricted method in java.lang.System has been called"       | JDK 17                                                                                                 |
| Android build on Windows: `CMAKE_OBJECT_PATH_MAX` or "build.ninja still dirty" | short path and hoisted `node_modules`, or WSL 2 / EAS                                                  |
| No EAS project                                                                 | `eas init`, then `APP.easProjectId` and `APP.owner` in `apps/mobile/app.config.ts`                     |
| The API stops at boot naming a variable                                        | fix it in `apps/api/.env` ([environment.md](environment.md))                                           |
| `pnpm services:up`: "port is already allocated"                                | another project holds it: another port in the root `.env`, and the URL in `apps/api/.env` to match     |
| `Cannot reach PostgreSQL` in `pnpm test:integration`                           | `pnpm services:up` (or `DATABASE_URL` pointing at a server)                                            |
| The app gets 426 "no longer supported"                                         | `MOBILE_MIN_VERSION_*` of the API is above the app's version: unset it locally                         |

## 16. Appendix

### 16.1 Accounts and identifiers

| Thing            | Where                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Example accounts | `member@example.com` / `member-password`, `admin@example.com` / `admin-password`: the mock API's and the seed's (local only)                                                                                                  |
| Application ids  | `APP.identifier` + `.dev`, `.preview`, `.e2e`, or nothing for production                                                                                                                                                      |
| URL schemes      | `APP.scheme` + `-dev`, `-preview`, `-e2e`, or nothing                                                                                                                                                                         |
| Ports            | `4010` mock API, `8081` Metro, `3010` API, `4331` the landing, `5452` PostgreSQL, `6399` Redis, `1045`/`8045` Mailpit, `8090` the stack, `8091` the browser suite's web image, `4328`/`3011`/`9100` the observability backend |

### 16.2 The other documents

| Document                                                                                                                                          | For                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [step-by-step.md](step-by-step.md)                                                                                                                | what to do, in order, from zero to the stores                                      |
| [mobile-architecture.md](mobile-architecture.md)                                                                                                  | how the app's code is organized and why                                            |
| [architecture.md](architecture.md), [api-conventions.md](api-conventions.md), [authorization.md](authorization.md), [database.md](database.md)    | the API: modules, HTTP conventions, access rules, data                             |
| [error-handling.md](error-handling.md), [observability.md](observability.md), [environment.md](environment.md), [security.md](security.md)        | errors end to end; logs, traces, metrics; API variables; the API's security design |
| [adr/](adr/README.md)                                                                                                                             | the decisions and their reasons                                                    |
| [testing.md](testing.md), [performance.md](performance.md)                                                                                        | tests; performance and the bundle budget                                           |
| [releases.md](releases.md), [ci-cd.md](ci-cd.md)                                                                                                  | builds, stores, updates; workflows and settings                                    |
| [deploy-vps.md](deploy-vps.md), [disaster-recovery.md](disaster-recovery.md), [load-testing.md](load-testing.md)                                  | the server: setting it up and running it; backups and restores; load tests         |
| [alerting.md](alerting.md), [incident-response.md](incident-response.md), [troubleshooting.md](troubleshooting.md)                                | SLOs and alerts; the runbooks; the server's error messages                         |
| [production-readiness.md](production-readiness.md), [store-compliance.md](store-compliance.md)                                                    | the release checklist; what the stores require                                     |
| [accessibility.md](accessibility.md), [localization.md](localization.md)                                                                          | the accessibility gate; translating the app (optional)                             |
| [SECURITY.md](../SECURITY.md)                                                                                                                     | threat model, MASVS, data inventory, secrets, dependencies                         |
| [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md), [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md), [CONTRIBUTING.md](../CONTRIBUTING.md) | the rules; when a change is done; the workflow                                     |
| [AGENTS.md](../AGENTS.md)                                                                                                                         | instructions for AI coding agents                                                  |
