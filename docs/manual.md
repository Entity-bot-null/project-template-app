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
5. [Daily development](#5-daily-development)
6. [Tests](#6-tests)
7. [Commits, pushes and pull requests](#7-commits-pushes-and-pull-requests)
8. [Configuration](#8-configuration)
9. [Command reference](#9-command-reference)
10. [CI/CD](#10-cicd)
11. [Builds, stores and OTA updates](#11-builds-stores-and-ota-updates)
12. [Monitoring a released app](#12-monitoring-a-released-app)
13. [Maintenance calendar](#13-maintenance-calendar)
14. [When something fails](#14-when-something-fails)
15. [Appendix](#15-appendix)

## 1. What the template is

A React Native app for Android and iOS built with Expo (SDK 57), ready for store release: strict
TypeScript, file-based navigation with protected route groups, a typed API client generated from
an OpenAPI contract, a secure session (refresh token in the Keychain/Keystore), offline awareness,
a design system with light and dark themes, error reporting, analytics with consent, feature flags,
push notification plumbing, unit/integration/end-to-end tests, and CI/CD with EAS for builds, store
submissions and over-the-air updates.

It contains an **example feature** (sign-in, a paginated searchable list of items, item detail,
item creation, settings) that exercises every layer. Build your features next to it and delete it
once yours exist ([step-by-step.md](step-by-step.md#phase-6-make-it-yours)).

What it does not include on purpose, and why: [adr/0001-stack.md](adr/0001-stack.md) and
[SECURITY.md](../SECURITY.md#advanced-device-controls).

## 2. Tools

| Tool           | Version                                                                                        | Used for                                |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| Node.js        | 24.15+ (`.nvmrc`)                                                                              | everything JavaScript                   |
| pnpm           | 12.5.1 (`packageManager`; `corepack enable`; from Node.js 25, `npm install -g corepack` first) | dependencies and scripts                |
| Git            | current                                                                                        | version control; the hooks              |
| Android Studio | current, with the Android SDK, an emulator and **JDK 17**                                      | Android builds and the emulator         |
| Xcode          | the version the Expo SDK requires (macOS only)                                                 | iOS builds and the simulator            |
| EAS CLI        | `npm install -g eas-cli` (or `pnpm dlx eas-cli`), run in `apps/mobile`                         | builds, credentials, updates            |
| Maestro        | 2.10 (the version CI pins)                                                                     | end-to-end flows                        |
| Docker         | current                                                                                        | `pnpm sast`, `pnpm lint:workflows` only |
| GitHub CLI     | current                                                                                        | repository settings, workflows          |

Windows: native Android builds also need a short project path, Windows long paths and a hoisted
`node_modules` on that machine ([testing.md](testing.md#end-to-end)); WSL 2 or EAS builds avoid
those.

## 3. How the project is organized

A pnpm workspace: the app is the package `mobile` in `apps/mobile`, and the root holds what applies
to the whole repository. Commands run from the root; `pnpm --filter mobile <script>` runs one of
the app's own scripts.

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
openapi/                the API contract
scripts/                the repository's checks (hooks and CI) and pinned tool images
.github/                CI/CD
```

The rules between these folders (enforced by ESLint) and the reasons:
[mobile-architecture.md](mobile-architecture.md).

**Native code is generated.** `apps/mobile/android/` and `apps/mobile/ios/` are produced by
`expo prebuild` from `apps/mobile/app.config.ts` and never committed or edited by hand.

**Build variants.** One codebase, four variants (`APP_VARIANT`): `development`, `preview`, `e2e`,
`production`, each with its own application id and URL scheme so they install side by side
([releases.md](releases.md#build-variants-and-profiles)).

## 4. Running the app

The app runs as a **development build** (your own app binary with developer tools), not in Expo Go.

| Goal                                                | Commands                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First time on Android                               | `pnpm install`, `cp apps/mobile/.env.example apps/mobile/.env`, `pnpm mock:api` (terminal 1), `adb reverse tcp:4010 tcp:4010`, `pnpm android` (terminal 2) |
| First time on iOS (macOS)                           | the same with `pnpm ios` (the simulator reaches `localhost` directly)                                                                                      |
| Every other day                                     | `pnpm mock:api` and `pnpm start`, then open the installed app                                                                                              |
| After a native change                               | `pnpm prebuild`, then `pnpm android` / `pnpm ios` (they regenerate nothing while `apps/mobile/android/` and `apps/mobile/ios/` exist)                      |
| A development build without Android Studio or Xcode | `eas build --profile development --platform android` (or `development-simulator` for the iOS simulator) and install it from the link                       |

The mock API (`apps/mobile/scripts/mock-api.mjs`) implements the contract in memory: accounts
`member@example.com` / `member-password` and `admin@example.com` / `admin-password`, 45 example
items. `MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` makes tokens expire quickly (watch the session renew);
`MOCK_LATENCY_MS=1500` slows every answer (see the loading states). It also fails on demand, to see
an error state: `curl -X POST localhost:4010/__mock/sessions/revoke` ends the session at the app's
next request ([testing.md](testing.md#end-to-end) lists the others).

In the running app: `r` in the `pnpm start` terminal reloads, `j` opens React Native DevTools, `m`
opens the developer menu on the device.

## 5. Daily development

1. `git switch main && git pull`, then `pnpm install` when the lockfile changed.
2. A branch: `git switch -c feat/<description>` (types: `feat`, `fix`, `chore`, `docs`,
   `refactor`, `test`, `ci`, `build`, `perf`, `hotfix`, `release`).
3. The change, following the recipe of
   [mobile-architecture.md](mobile-architecture.md#adding-a-feature): contract → data hooks →
   screen → route → tests.
4. API contract changes: edit `openapi/openapi.json`, run `pnpm contract`, commit both files
   ([openapi/README.md](../openapi/README.md)).
5. A dependency: `pnpm --filter mobile exec expo install <package>` (never `pnpm add` for anything
   that touches native code); explain it in the pull request
   ([CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-dependency)).
6. Before pushing: `pnpm verify`.

## 6. Tests

| Kind                         | Command                                                                                       | Where                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Unit, component, integration | `pnpm test`                                                                                   | `apps/mobile/src/**/*.spec.ts(x)`, `*.int.spec.tsx` |
| With coverage and thresholds | `pnpm test:coverage`                                                                          | report in `apps/mobile/coverage/index.html`         |
| Watch mode                   | `pnpm --filter mobile test:watch`                                                             |                                                     |
| One folder or test           | `pnpm --filter mobile test features/items`, `pnpm --filter mobile test -t "<name>"`           |                                                     |
| End-to-end on a device       | `pnpm test:e2e:mobile` (a release build of the `e2e` variant installed, the mock API running) | `apps/mobile/.maestro/flows/`                       |

How to write them and the helpers: [testing.md](testing.md).

## 7. Commits, pushes and pull requests

- Commit messages and pull request titles follow Conventional Commits:
  `feat(items): share an item` ([CONTRIBUTING.md](../CONTRIBUTING.md#commits)).
- Hooks: `pre-commit` (staged files: no `.env`, secret scan, lint with fixes, format),
  `commit-msg` (commitlint), `pre-push` (no pushes to `main`, branch name, `pnpm typecheck`,
  `pnpm test`).
- Pull requests use the template: what and why, how it was tested on devices, screenshots, the
  release impact (OTA update or new store build) and the Definition of Done.
- Merge with **Squash and merge** once **CI passed** and **Conventions** are green and a reviewer
  approved.

## 8. Configuration

| Where                                       | What                                                                                                       | Committed |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| `apps/mobile/app.config.ts` → `APP`         | name, slug, identifier, URL scheme, EAS project id and owner, link domain, colors (REQUIERE CONFIGURACIÓN) | yes       |
| `apps/mobile/.env`                          | local public configuration (`EXPO_PUBLIC_*`)                                                               | never     |
| `apps/mobile/.env.example`                  | documentation of every variable                                                                            | yes       |
| `apps/mobile/eas.json`                      | build profiles: variant, environment, channel, distribution; submission                                    | yes       |
| EAS environment variables                   | per environment: API URL, Sentry DSN, `SENTRY_*` (build time)                                              | on EAS    |
| GitHub environments `preview`, `production` | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`                                                                          | on GitHub |

Every `EXPO_PUBLIC_*` value is compiled into the app and readable by anyone: never a secret.
`apps/mobile/src/config/env.schema.ts` validates them when the app config is evaluated (a bad value
fails the build) and at startup. The full table: [releases.md](releases.md#environment-variables).

## 9. Command reference

| Command                                 | Does                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                          | dependencies; installs the Git hooks and generates Expo's types (`prepare`)                                                                           |
| `pnpm start`                            | Metro dev server for an installed development build                                                                                                   |
| `pnpm android` / `pnpm ios`             | compile, install and run a development build locally                                                                                                  |
| `pnpm prebuild`                         | regenerate `apps/mobile/android/` and `apps/mobile/ios/`                                                                                              |
| `pnpm mock:api`                         | the mock API on `127.0.0.1:4010`                                                                                                                      |
| `pnpm --filter mobile types:generate`   | Expo's generated types (`apps/mobile/expo-env.d.ts`, typed routes)                                                                                    |
| `pnpm lint` / `pnpm lint:fix`           | ESLint, zero warnings                                                                                                                                 |
| `pnpm format` / `pnpm format:check`     | Prettier                                                                                                                                              |
| `pnpm typecheck`                        | contract drift, generated types, `tsc`                                                                                                                |
| `pnpm test` / `pnpm test:coverage`      | Jest (`pnpm --filter mobile test:watch` to watch)                                                                                                     |
| `pnpm test:e2e:mobile`                  | Maestro flows                                                                                                                                         |
| `pnpm test:scripts`                     | the tests of the repository scripts (`scripts/*.test.mjs` and `apps/*/scripts/*.test.mjs`: Doberman's engine, the dependency policy, the tool images) |
| `pnpm expo:doctor`                      | expo-doctor, every check; dependency versions against the installed SDK's manifest (the lockfile), not the newest published patches                   |
| `pnpm security`                         | `pnpm audit` (high), dependency and license policy, secret scan                                                                                       |
| `pnpm deps:check` / `pnpm secrets:scan` | the two policies separately                                                                                                                           |
| `pnpm sast`                             | Semgrep (Docker)                                                                                                                                      |
| `pnpm lint:workflows`                   | actionlint, zizmor, shellcheck (Docker)                                                                                                               |
| `pnpm contract`                         | regenerate `apps/mobile/src/api/schema.d.ts` from `openapi/openapi.json`                                                                              |
| `pnpm build`                            | production JavaScript bundles of both platforms in `apps/mobile/dist/`                                                                                |
| `pnpm perf:check`                       | the bundle budget, after `pnpm build`                                                                                                                 |
| `pnpm sbom:generate`                    | CycloneDX SBOM of the production dependencies                                                                                                         |
| `pnpm verify`                           | format, lint, typecheck, coverage, expo-doctor, security, build, bundle budget                                                                        |

EAS (global CLI, `eas <command>`): `login`, `init`, `build`, `build:list`, `submit`, `update`,
`update:list`, `update:edit`, `update:republish`, `update:roll-back-to-embedded`, `channel:list`,
`channel:protect`, `credentials`, `env:create`, `env:list`, `device:create`, `fingerprint:compare`.

## 10. CI/CD

| Workflow      | When                                               | Does                                                                                                             |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CI            | every pull request and push to `main`              | every gate (format, lint, types, doctor, SAST, tests, security, bundle, prebuild); required check: **CI passed** |
| Conventions   | every pull request, again when its title is edited | branch name and title (Conventional Commits); required check: **Conventions**                                    |
| E2E (Android) | pull requests and pushes that touch the app        | release APK of the `e2e` variant, mock API, emulator, Maestro                                                    |
| Release       | push to `main`                                     | the release pull request and CI on it; on merge, the tag and the GitHub release with the SBOM                    |
| EAS build     | by hand, from `main`                               | gates, then an EAS build of `preview` or `production` (optional submission to internal testing)                  |
| EAS update    | by hand, from `main`                               | gates, then an OTA update to `preview` or `production`, optionally staged                                        |
| EAS rollback  | by hand, from `main`                               | republish an earlier update or go back to the embedded bundle                                                    |
| CodeQL        | opt-in                                             | security analysis                                                                                                |

No pull request can build, sign, submit or publish: [ci-cd.md](ci-cd.md#what-protects-production).

## 11. Builds, stores and OTA updates

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

## 12. Monitoring a released app

- **Sentry** (when `EXPO_PUBLIC_SENTRY_DSN` is set): crashes and errors with the release, build,
  update id and channel; source maps uploaded by builds and by the EAS update workflow.
- **The stores:** Play Console → Android vitals (crashes, ANRs); App Store Connect / Xcode
  Organizer (crashes, energy, hangs); ratings and reviews.
- **EAS:** `eas update:insights`, `eas channel:insights` (adoption and crash rates per update).
- **Settings → About** in the app shows the version, build and update a user runs: ask for it in
  bug reports.

## 13. Maintenance calendar

| When                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every week                          | Approve Dependabot's pull requests: patch and minor updates merge themselves once CI is green; majors and workflow updates you merge by hand ([ci-cd.md](ci-cd.md#dependency-updates)).                                                                                                                                                                                                                                                                                          |
| Every release                       | Preview build, test on devices, production build, internal testing, staged store rollout.                                                                                                                                                                                                                                                                                                                                                                                        |
| Every Expo SDK (about three a year) | Upgrade one SDK at a time ([releases.md](releases.md#expo-sdk-upgrades)).                                                                                                                                                                                                                                                                                                                                                                                                        |
| Every quarter                       | Check the audit exceptions (`audit.ignore`) and security `overrides` of `pnpm-workspace.yaml` (remove an override once `pnpm why <package>` shows a fixed version without it); the pinned EAS CLI, Maestro, Node.js and pnpm versions, and TypeScript ([ci-cd.md](ci-cd.md#keeping-the-stack-current)); credentials that expire (the Apple distribution certificate lasts a year: renew it with `eas credentials` before it does, or the production workflow's iOS build fails). |
| Before store deadlines              | Google Play's target API level requirement (each August) and Apple's minimum Xcode/SDK requirement (each spring): new SDK builds meet them.                                                                                                                                                                                                                                                                                                                                      |

## 14. When something fails

The README has a troubleshooting table ([README.md](../README.md#troubleshooting)); the end-to-end
specifics are in [testing.md](testing.md#end-to-end). The most common:

| Message                                                                        | Fix                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| "You seem to be offline" on the Android emulator                               | `adb reverse tcp:4010 tcp:4010`                                                                        |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…`                              | set it (`apps/mobile/.env` locally, EAS environment for builds); HTTPS outside localhost               |
| `pnpm expo:doctor` reports versions                                            | `EXPO_OFFLINE=1 pnpm --filter mobile exec expo install --fix` (the versions the installed SDK expects) |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`                                          | a release younger than seven days: use the previous one or wait                                        |
| Android build: "A restricted method in java.lang.System has been called"       | JDK 17                                                                                                 |
| Android build on Windows: `CMAKE_OBJECT_PATH_MAX` or "build.ninja still dirty" | short path and hoisted `node_modules`, or WSL 2 / EAS                                                  |
| No EAS project                                                                 | `eas init`, then `APP.easProjectId` and `APP.owner` in `apps/mobile/app.config.ts`                     |

## 15. Appendix

### 15.1 Accounts and identifiers

| Thing             | Where                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Mock API accounts | `member@example.com` / `member-password`, `admin@example.com` / `admin-password` (local only) |
| Application ids   | `APP.identifier` + `.dev`, `.preview`, `.e2e`, or nothing for production                      |
| URL schemes       | `APP.scheme` + `-dev`, `-preview`, `-e2e`, or nothing                                         |
| Ports             | `4010` mock API, `8081` Metro                                                                 |

### 15.2 The other documents

| Document                                                                                                                                          | For                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [step-by-step.md](step-by-step.md)                                                                                                                | what to do, in order, from zero to the stores          |
| [mobile-architecture.md](mobile-architecture.md)                                                                                                  | how the code is organized and why                      |
| [testing.md](testing.md), [performance.md](performance.md)                                                                                        | tests; performance and the bundle budget               |
| [releases.md](releases.md), [ci-cd.md](ci-cd.md)                                                                                                  | builds, stores, updates; workflows and settings        |
| [production-readiness.md](production-readiness.md), [store-compliance.md](store-compliance.md)                                                    | the release checklist; what the stores require         |
| [accessibility.md](accessibility.md), [localization.md](localization.md)                                                                          | the accessibility gate; translating the app (optional) |
| [SECURITY.md](../SECURITY.md)                                                                                                                     | threat model, MASVS, secrets, dependencies             |
| [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md), [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md), [CONTRIBUTING.md](../CONTRIBUTING.md) | the rules; when a change is done; the workflow         |
| [AGENTS.md](../AGENTS.md)                                                                                                                         | instructions for AI coding agents                      |
