# Production readiness

The checklist before the first store release, and again before any release that changes native
code, data collection, permissions or the release process. Copy it into the release issue and tick
each line with a link to its evidence (a CI run, a test, a store page, a drill record).

## Classification

Every capability of the template, and every line below, is exactly one of:

| Class                      | Meaning                                                                                           | Tick it when                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **CORE**                   | in the template, on by default, needed by almost every professional app                           | it still holds (CI green, the test exists)                                                 |
| **OPTIONAL**               | in the template or documented, off until a product needs it                                       | the product decided: enabled and tested, or explicitly not needed                          |
| **REQUIRES CONFIGURATION** | the template provides the mechanism and the steps; the project provides accounts, values or forms | the project configured it on its accounts. Never tick it because the template documents it |
| **PROJECT-SPECIFIC**       | depends on product requirements; not forced into the template                                     | the product decided, and implemented it if needed                                          |

## Architecture

| Done | Item                  | Class                         | Verified by                                                                                                                                                     |
| ---- | --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | Dependency boundaries | CORE                          | `pnpm lint` (architecture rules of `eslint.config.mjs`)                                                                                                         |
| [ ]  | API contract          | CORE / REQUIRES CONFIGURATION | `pnpm typecheck` (contract drift); `openapi/openapi.json` is the product's backend contract, not the example                                                    |
| [ ]  | Authentication        | CORE / REQUIRES CONFIGURATION | `session.spec.ts`, `http.spec.ts`; the backend implements the session endpoints with rotation and reuse detection ([openapi/README.md](../openapi/README.md))   |
| [ ]  | State management      | CORE                          | server state in TanStack Query, client state in Zustand ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#state))                                                |
| [ ]  | Storage               | CORE                          | [data inventory](../SECURITY.md#data-inventory) current; `storage.spec.ts`                                                                                      |
| [ ]  | Offline behavior      | CORE / OPTIONAL               | the CORE offline behavior holds; any offline persistence or write queue meets the five requirements of [MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#offline) |
| [ ]  | App lifecycle         | CORE                          | every row of [MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#app-lifecycle) holds, new features' rows included                                                  |

## Security

| Done | Item                | Class                         | Verified by                                                                                                                                                 |
| ---- | ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | Secrets             | CORE                          | `pnpm security` (secret scan), gitleaks over the history (CI); no secret in `EXPO_PUBLIC_*`                                                                 |
| [ ]  | Secure storage      | CORE                          | refresh token in SecureStore only (`storage.spec.ts`, `session.spec.ts`)                                                                                    |
| [ ]  | HTTPS               | CORE / REQUIRES CONFIGURATION | `env.schema.ts` refuses HTTP outside localhost; the production API URL is HTTPS (EAS environment)                                                           |
| [ ]  | Permissions         | CORE                          | only the permissions the app uses ([STORE_COMPLIANCE.md](STORE_COMPLIANCE.md#what-the-template-ships)); each new one asked in context with a usage text     |
| [ ]  | Deep links          | CORE                          | allowlist (`links.spec.ts`, `routes.spec.tsx`); `apple-app-site-association` and `assetlinks.json` served if a link domain is used (REQUIRES CONFIGURATION) |
| [ ]  | Notification links  | CORE                          | `notifications.spec.ts`                                                                                                                                     |
| [ ]  | Dependency security | CORE                          | `pnpm security` (audit, license and source policy); the exceptions of [SECURITY.md](../SECURITY.md#known-advisories) reviewed                               |
| [ ]  | Static analysis     | CORE                          | Semgrep (`pnpm sast`, CI), workflow audit (`pnpm lint:workflows`, CI)                                                                                       |
| [ ]  | MASVS review        | CORE / PROJECT-SPECIFIC       | [SECURITY.md](../SECURITY.md#owasp-masvs) read against the product's additions; [advanced device controls](../SECURITY.md#advanced-device-controls) decided |

## Testing

| Done | Item                       | Class                  | Verified by                                                                                                    |
| ---- | -------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| [ ]  | Unit                       | CORE                   | `pnpm test:coverage` (thresholds of `jest.config.js`)                                                          |
| [ ]  | Integration (screen → API) | CORE                   | `*.int.spec.tsx`                                                                                               |
| [ ]  | Component                  | CORE                   | `src/ui/components/components.spec.tsx`                                                                        |
| [ ]  | End-to-end                 | CORE                   | the E2E (Android) workflow green; Maestro flows cover the product's critical journeys                          |
| [ ]  | Device testing             | REQUIRES CONFIGURATION | a small Android phone and a recent iPhone, release builds ([TESTING.md](TESTING.md#manual-testing-on-devices)) |
| [ ]  | Accessibility              | CORE                   | `src/a11y.spec.tsx`; the manual checklist of [ACCESSIBILITY.md](ACCESSIBILITY.md) with TalkBack and VoiceOver  |
| [ ]  | Offline                    | CORE                   | airplane mode during a request, a cold start offline (manual)                                                  |
| [ ]  | Upgrade testing            | CORE                   | [RELEASES.md](RELEASES.md#upgrade-testing) done from the current store version                                 |

## Performance

| Done | Item             | Class                  | Verified by                                                                                                 |
| ---- | ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| [ ]  | Startup          | CORE                   | cold start under the target on a mid-range Android release build ([PERFORMANCE.md](PERFORMANCE.md#targets)) |
| [ ]  | Bundle size      | CORE                   | `pnpm bundle:check` (CI)                                                                                    |
| [ ]  | Images           | CORE                   | `Image` from `src/ui`; server-side sizes close to the displayed size                                        |
| [ ]  | List performance | CORE                   | virtualized lists, no blank areas while scrolling on a low-end device                                       |
| [ ]  | Memory           | REQUIRES CONFIGURATION | no growth while navigating back and forth (Android Studio profiler, Xcode Instruments)                      |
| [ ]  | Network          | CORE                   | paginated, cached, debounced requests ([PERFORMANCE.md](PERFORMANCE.md#network-and-data))                   |

## Observability

| Done | Item                            | Class                         | Verified by                                                                                                      |
| ---- | ------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [ ]  | Sentry                          | REQUIRES CONFIGURATION        | DSN and `SENTRY_*` in the EAS environments; a test error from a preview build appears with readable stack traces |
| [ ]  | Analytics consent               | CORE / REQUIRES CONFIGURATION | nothing sent before consent (`analytics.spec.ts`); the provider, if any, configured                              |
| [ ]  | Redaction                       | CORE                          | `redact.spec.ts`, `sentry.spec.ts`                                                                               |
| [ ]  | Release and environment tagging | CORE                          | Sentry events carry the release, build, environment, update id and channel                                       |

## Store

| Done | Item                   | Class                  | Verified by                                                                       |
| ---- | ---------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| [ ]  | Apple compliance       | REQUIRES CONFIGURATION | [STORE_COMPLIANCE.md](STORE_COMPLIANCE.md#apple-app-store)                        |
| [ ]  | Google Play compliance | REQUIRES CONFIGURATION | [STORE_COMPLIANCE.md](STORE_COMPLIANCE.md#google-play)                            |
| [ ]  | Privacy policy         | REQUIRES CONFIGURATION | a public URL matching the data inventory                                          |
| [ ]  | Permissions            | CORE                   | the store declarations match the build                                            |
| [ ]  | Metadata               | REQUIRES CONFIGURATION | names, descriptions, categories, support URL, review notes with a working account |
| [ ]  | Screenshots            | REQUIRES CONFIGURATION | current version, required sizes                                                   |

## Release

| Done | Item                      | Class                  | Verified by                                                                                                                                                                             |
| ---- | ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ ]  | Production build          | REQUIRES CONFIGURATION | the EAS build workflow from a release tag ([RELEASES.md](RELEASES.md#builds))                                                                                                           |
| [ ]  | Signing                   | REQUIRES CONFIGURATION | credentials on EAS; Play App Signing; nothing in the repository                                                                                                                         |
| [ ]  | Runtime version           | CORE                   | fingerprint policy; `eas fingerprint:compare` explains a change ([RELEASES.md](RELEASES.md#runtime-versions-and-compatibility))                                                         |
| [ ]  | OTA compatibility         | CORE                   | the release's change is in the right column of [what can ship as an OTA update](RELEASES.md#what-can-ship-as-an-ota-update)                                                             |
| [ ]  | Rollout                   | REQUIRES CONFIGURATION | the [rollout stages](RELEASES.md#rollout-stages) followed; production channel protected (`eas channel:protect`) where the account has protected channels, its token a Release Manager's |
| [ ]  | Rollback                  | REQUIRES CONFIGURATION | an OTA rollback rehearsed on preview (EAS rollback workflow); the store halt steps known ([RELEASES.md](RELEASES.md#rollback))                                                          |
| [ ]  | Minimum supported version | REQUIRES CONFIGURATION | decided: implemented with the backend, or explicitly not yet ([RELEASES.md](RELEASES.md#minimum-supported-version))                                                                     |

## Operations

| Done | Item               | Class                         | Verified by                                                                                                                                                                                                  |
| ---- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ]  | Incident procedure | REQUIRES CONFIGURATION        | who is alerted (Sentry, store vitals), who decides a rollback, where it is discussed                                                                                                                         |
| [ ]  | Rollback procedure | CORE / REQUIRES CONFIGURATION | [RELEASES.md](RELEASES.md#rollback), rehearsed                                                                                                                                                               |
| [ ]  | Owner and contacts | REQUIRES CONFIGURATION        | CODEOWNERS, `SECURITY.md` contact, production reviewers in the GitHub environment                                                                                                                            |
| [ ]  | Emergency release  | CORE / REQUIRES CONFIGURATION | JavaScript fix: EAS update with a staged rollout; native fix: a build with expedited review (App Store) and a halted staged rollout (Play); a minimum supported version for vulnerabilities that cannot wait |

## Sign-off

```
Release / version / build:
Checked by (name, date):
Open items, accepted with a reason and an owner:
```
