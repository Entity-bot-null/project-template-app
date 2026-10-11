# Project template: mobile app

A starting point for professional, commercial mobile apps for Android and iOS with Expo and React
Native: the architecture, quality gates, security, observability, testing, CI/CD and release process
a store app needs, with a small example feature (sign-in, a list with search and pagination, detail,
creation, settings) that shows every layer working together. Replace the example with the product;
keep the structure.

Everything project-specific is a placeholder marked **REQUIERE CONFIGURACIÓN**, except in the files
that cannot hold a comment: `package.json` (`name`) and `eas.json` (`ascAppId`), which
[docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md) covers.

**Starting a new app?** Follow the step-by-step guide, [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md):
what to do, in order, from the information and store accounts you need to the app published, with a
check after every step (en español: [docs/STEP_BY_STEP.es.md](docs/STEP_BY_STEP.es.md)). **Using it
day to day?** The manual, [docs/MANUAL.md](docs/MANUAL.md), explains how everything works and lists
every command (en español: [docs/MANUAL.es.md](docs/MANUAL.es.md)).

- [Stack](#stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Start a new project](#start-a-new-project)
- [Branding](#branding)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)

## Stack

| Area          | Choice                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Platform      | Expo SDK 57, React Native 0.86 (New Architecture only), React 19.2, Hermes               |
| Language      | TypeScript 6, strict                                                                     |
| Navigation    | Expo Router (file-based, typed routes, protected route groups)                           |
| Data          | TanStack Query (server state), Zustand (client state), Zod (validation)                  |
| Forms         | React Hook Form + Zod                                                                    |
| API           | OpenAPI contract, generated types (`openapi-typescript`), `openapi-fetch`                |
| Storage       | `expo-secure-store` (credentials), `expo-sqlite` key-value store (preferences)           |
| Device        | `expo-notifications`, `expo-network`, `expo-image`, `expo-updates`, `expo-application`   |
| Observability | Sentry (`@sentry/react-native`) behind an interface; analytics behind an interface       |
| Testing       | Jest (`jest-expo`), React Native Testing Library, Maestro (end-to-end)                   |
| Quality       | ESLint (typed, architecture rules), Prettier, expo-doctor, Husky, commitlint             |
| Security      | pnpm supply-chain policies, dependency and license policy, secretlint, gitleaks, Semgrep |
| Delivery      | EAS Build, EAS Submit, EAS Update; GitHub Actions; release-please                        |

Why each one, and what was ruled out: [docs/adr/0001-stack.md](docs/adr/0001-stack.md).

## Requirements

- Node.js 24 (`.nvmrc`) and pnpm (`corepack enable`; the version is pinned in `package.json`; from
  Node.js 25, which ships no Corepack, `npm install -g corepack` first).
- Android: Android Studio with the SDK, an emulator and **JDK 17**. Native builds on Windows have
  extra requirements (a short path, long paths enabled, a hoisted `node_modules`:
  [docs/TESTING.md](docs/TESTING.md#end-to-end)); WSL 2 or EAS builds avoid them.
- iOS: macOS with Xcode and a simulator.
- An [Expo](https://expo.dev) account for EAS builds and updates.
- Docker, only for `pnpm sast` and `pnpm lint:workflows` (CI runs them anyway).

This template uses development builds, not Expo Go: it includes native configuration Expo Go cannot
load.

## Quick start

```sh
pnpm install                 # dependencies and Git hooks
cp .env.example .env         # local configuration: the mock API on localhost:4010
pnpm mock:api                # terminal 1: an in-memory implementation of the API contract
pnpm android                 # terminal 2: compile and run a development build on the emulator
#   or: pnpm ios             # on macOS, in the simulator
```

On an Android emulator or a USB device, forward the mock API's port once per session:
`adb reverse tcp:4010 tcp:4010`. Sign in with `member@example.com` / `member-password`.

After the first native build, `pnpm start` is enough: JavaScript changes reload instantly. After a
native change (a dependency with native code, a config plugin, `app.config.ts` native fields, the
icons or the splash), run `pnpm prebuild`, then `pnpm android` / `pnpm ios`: those two generate
`android/` and `ios/` only when the folders are missing, so on their own they rebuild the old native
project.

## Commands

| Command                                      | Does                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm start`                                 | Metro dev server for an installed development build                                                                           |
| `pnpm android` / `pnpm ios`                  | compile, install and run a development build locally (generate `android/` / `ios/` only when missing)                         |
| `pnpm prebuild`                              | regenerate `android/` and `ios/` from `app.config.ts` (never edit them)                                                       |
| `pnpm mock:api`                              | the mock API on `127.0.0.1:4010` (`MOCK_ACCESS_TTL_SEC`, `MOCK_LATENCY_MS` to test renewal and loading states)                |
| `pnpm lint` / `pnpm lint:fix`                | ESLint, zero warnings                                                                                                         |
| `pnpm format` / `pnpm format:check`          | Prettier                                                                                                                      |
| `pnpm typecheck`                             | contract drift check, typed routes, `tsc`                                                                                     |
| `pnpm types:generate`                        | Expo's generated types (`expo-env.d.ts`, typed routes in `.expo/types`); run by install, lint and typecheck                   |
| `pnpm test` / `test:watch` / `test:coverage` | Jest; coverage with thresholds                                                                                                |
| `pnpm test:e2e`                              | Maestro flows on a running emulator/simulator ([docs/TESTING.md](docs/TESTING.md#end-to-end))                                 |
| `pnpm expo:doctor`                           | expo-doctor: dependency versions against the installed SDK, config, native module issues                                      |
| `pnpm security`                              | `pnpm audit`, dependency and license policy, secret scan                                                                      |
| `pnpm sast`                                  | Semgrep (Docker)                                                                                                              |
| `pnpm lint:workflows`                        | actionlint, zizmor, shellcheck on hooks (Docker)                                                                              |
| `pnpm contract`                              | regenerate `src/api/schema.d.ts` from `openapi/openapi.json`                                                                  |
| `pnpm export`                                | production JavaScript bundles for both platforms in `dist/`                                                                   |
| `pnpm build:check`                           | `export` + bundle budget                                                                                                      |
| `pnpm sbom:generate`                         | CycloneDX SBOM of the production dependencies                                                                                 |
| `pnpm verify`                                | format, lint, typecheck, coverage, doctor, security, build check (CI adds `test:scripts`, `sast`, `lint:workflows`, prebuild) |

EAS commands use the EAS CLI, installed globally as Expo recommends (`npm install -g eas-cli`, or
`pnpm dlx eas-cli <command>`): `eas <command>`. The CI workflows pin its version.

## Project structure

```
.github/            workflows (CI, E2E, release, EAS build/update/rollback), templates, rulesets
.husky/             Git hooks
.maestro/           end-to-end flows
assets/images/      app icon, adaptive icon, splash, notification icon (neutral placeholders)
docs/               architecture, performance, releases, testing, CI/CD, decisions (adr/)
openapi/            the API contract
scripts/            mock API, checks used by hooks and CI
src/
  app/              routes (Expo Router)
  features/         product areas: screens and their data hooks
  api/              HTTP client, generated contract types
  auth/             session and tokens
  config/           validated public environment
  lib/              errors, observability, storage, query, links, notifications, permissions, analytics, flags
  store/            client state (Zustand)
  ui/               design system: tokens, theme, components
  hooks/            shared hooks
  test/             test setup and helpers
app.config.ts       app identity, variants, native configuration, plugins
eas.json            build profiles, submission
```

Details: [docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md).

## Start a new project

The complete sequence, with the accounts, commands and checks, is
[docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md). In short (each item is marked REQUIERE CONFIGURACIÓN
where it lives):

1. **Identity** in `app.config.ts` (`APP`): name, slug, identifier (reverse DNS of a domain you own;
   it cannot change after the first store release), URL scheme. `package.json` `name`.
2. **EAS**: `eas login`, `eas init`; copy the project id and owner into `APP`
   ([docs/RELEASES.md](docs/RELEASES.md#first-time-setup)).
3. **Environment**: `.env` for local development; EAS environment variables for `development`,
   `preview` and `production` (API URLs, Sentry) ([docs/RELEASES.md](docs/RELEASES.md#environment-variables)).
4. **API**: replace `openapi/openapi.json` with the product's contract, `pnpm contract`, and adapt
   `src/auth/` if its session endpoints differ ([openapi/README.md](openapi/README.md)).
5. **Branding**: icons, splash, colors ([below](#branding)).
6. **Sentry**: a project for the app; DSN and `SENTRY_*` variables in EAS; `SENTRY_ORG` and
   `SENTRY_PROJECT` repository variables for OTA source maps.
7. **Links** (optional): `APP.linkDomain`, with `apple-app-site-association` and `assetlinks.json`
   served by that domain ([docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md#deep-links)).
8. **Push notifications** (optional): FCM and APNs credentials on EAS, and a `PushTokenRegistrar`
   for the backend ([docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md#notifications)).
9. **Analytics** (optional): a provider in `src/lib/analytics/providers.ts`.
10. **Repository**: rulesets, environments, secrets, CODEOWNERS, the security contact and response
    times in `SECURITY.md` ([docs/CI_CD.md](docs/CI_CD.md#setting-up-the-repository)).
11. **Stores**: the app records in Play Console and App Store Connect, signing and submission
    credentials on EAS ([docs/RELEASES.md](docs/RELEASES.md#store-and-service-credentials)).
12. **The example feature**: build the product's features alongside `items`, using it as the
    reference, then delete `src/features/items`, its routes (the home tab included), its links in
    `src/lib/links.ts`, the `newItemForm` flag, the `item_created` event, its Maestro flow and its
    contract paths; flows 01 and 02 wait for the items list after sign-in
    ([docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md#63-your-features)).

Search for `REQUIERE CONFIGURACIÓN` to find anything left.

## Branding

The template ships neutral placeholder images and a neutral palette: no brand. Replace them with
the product's own:

| File                                         | Size and format                                                          | Used for                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `assets/images/icon.png`                     | 1024 × 1024 PNG, **no transparency**                                     | iOS app icon (the system applies the rounded mask); onboarding                |
| `assets/images/adaptive-icon-foreground.png` | 1024 × 1024 PNG, transparent; the logo inside the central 66 % safe zone | Android adaptive icon (over `APP.colors.adaptiveIconBackground`)              |
| `assets/images/adaptive-icon-monochrome.png` | 1024 × 1024 PNG, single color on transparent                             | Android themed (monochrome) icon                                              |
| `assets/images/splash-icon.png`              | 1024 × 1024 PNG, transparent, shown at 160 dp wide                       | splash screen, over `APP.colors.splashBackground` (and `…Dark`)               |
| `assets/images/notification-icon.png`        | 96 × 96 PNG, **white** on transparent                                    | Android notification small icon (tinted with `APP.colors.notificationAccent`) |

- Colors: the palette and semantic colors in `src/ui/theme/tokens.ts` (light and dark), and
  `APP.colors` in `app.config.ts`. `pnpm test` checks text contrast against WCAG AA in both themes.
- Fonts: the template uses the system fonts. A brand font is embedded at build time with the
  `expo-font` config plugin and set in the typography tokens.
- Icons, splash and app name are native: changing them needs a new store build, not an OTA update.
- Store listing assets (screenshots, feature graphic, descriptions) are prepared in the stores'
  consoles; they are not part of the repository.

## Documentation

| Document                                                                     | For                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md), [.es](docs/STEP_BY_STEP.es.md) | what to do, in order, from zero to the stores                                                                        |
| [docs/MANUAL.md](docs/MANUAL.md), [.es](docs/MANUAL.es.md)                   | how everything works; every command                                                                                  |
| [AGENTS.md](AGENTS.md)                                                       | AI coding agents (Claude Code, Codex, Cursor…): rules, commands, Expo context                                        |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                           | workflow: branches, commits, hooks, review, dependencies                                                             |
| [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md)                         | the rules and what enforces them                                                                                     |
| [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md)                               | when a change is finished                                                                                            |
| [SECURITY.md](SECURITY.md)                                                   | reporting, threat model, OWASP MASVS, secrets, storage, supply chain                                                 |
| [docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md)                   | layers, navigation, state, API, auth, errors, storage, offline, native code                                          |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                                   | targets, lists, rendering, startup, bundle budget, measuring                                                         |
| [docs/TESTING.md](docs/TESTING.md)                                           | test levels, helpers, coverage, Maestro end-to-end                                                                   |
| [docs/RELEASES.md](docs/RELEASES.md)                                         | variants, environment variables, versions, builds, stores, OTA updates, rollback, SDK upgrades                       |
| [docs/CI_CD.md](docs/CI_CD.md)                                               | workflows, protections, environments, secrets, repository setup                                                      |
| [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)                 | the checklist before a store release; the CORE / OPTIONAL / REQUIRES CONFIGURATION / PROJECT-SPECIFIC classification |
| [docs/STORE_COMPLIANCE.md](docs/STORE_COMPLIANCE.md)                         | App Store and Google Play requirements: privacy labels, Data safety, permissions, account deletion                   |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)                               | the accessibility gate: built-in guarantees, automated checks, the per-feature checklist                             |
| [docs/LOCALIZATION.md](docs/LOCALIZATION.md)                                 | translating the app, when the product needs it (optional)                                                            |
| [docs/adr/](docs/adr/)                                                       | architecture decisions                                                                                               |
| [openapi/README.md](openapi/README.md)                                       | the API contract and the mock API                                                                                    |
| [.maestro/README.md](.maestro/README.md)                                     | the end-to-end flows                                                                                                 |

## Troubleshooting

| Problem                                                                                 | Fix                                                                                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app cannot reach the mock API on Android ("You seem to be offline")                 | `adb reverse tcp:4010 tcp:4010` (again after restarting the emulator or reconnecting a device)                                                     |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…` when building                         | set the variable (`.env` locally, EAS environment for builds); HTTPS outside localhost                                                             |
| Android build: `CMAKE_OBJECT_PATH_MAX` warnings, then "CXX compiler … broken" (Windows) | move the project to a short path (`C:\dev\<app>`), enable Windows long paths, `pnpm install` again                                                 |
| Android build on Windows: "manifest 'build.ninja' still dirty after 100 tries"          | set the user environment variable `pnpm_config_node_linker=hoisted`, `pnpm install` again ([docs/TESTING.md](docs/TESTING.md#end-to-end))          |
| Maestro types nothing into a field on the emulator                                      | `adb shell settings put secure stylus_handwriting_enabled 0` (Gboard's stylus tutorial covers the keyboard)                                        |
| Android build: "A restricted method in java.lang.System has been called"                | use JDK 17 (`JAVA_HOME`); JDK 24+ breaks the native CMake step                                                                                     |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`                                                   | the version is younger than seven days (supply-chain policy): use the previous release, or wait                                                    |
| `pnpm expo:doctor` reports version mismatches                                           | `EXPO_OFFLINE=1 pnpm exec expo install --fix` (the versions the installed SDK expects; newer SDK patches come through Dependabot after seven days) |
| Stale JavaScript, odd Metro errors                                                      | `pnpm start --clear`                                                                                                                               |
| Native errors after changing dependencies or `app.config.ts`                            | `pnpm prebuild` (regenerates `android/` and `ios/`), then `pnpm android` / `pnpm ios`                                                              |
| Typed routes errors after adding a route, or `process.env` read as `any`                | `pnpm types:generate` (also run by `pnpm install`, `pnpm lint`, `pnpm typecheck` and `pnpm start`)                                                 |
| A Jest test hangs or Jest does not exit                                                 | a missing `await` (RNTL 14 is async) or a timer left running; see [docs/TESTING.md](docs/TESTING.md#flaky-tests)                                   |
| Push notifications do not arrive                                                        | development or release build on a **real device**, permission granted, EAS project id set, FCM/APNs credentials on EAS                             |
