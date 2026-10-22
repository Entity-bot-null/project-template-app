# Releases

How the app gets from `main` to users: builds, store submissions, over-the-air (OTA) updates,
versions, configuration, credentials and rollbacks. The workflows that run these steps are described
in [ci-cd.md](ci-cd.md). The `eas` commands on this page run in `apps/mobile`, where `eas.json` and
the app config are.

- [The release flow](#the-release-flow)
- [Build variants and profiles](#build-variants-and-profiles)
- [Environment variables](#environment-variables)
- [Versioning](#versioning)
- [First-time setup](#first-time-setup)
- [Store and service credentials](#store-and-service-credentials)
- [Builds](#builds)
- [Store release](#store-release)
- [OTA updates](#ota-updates)
- [What can ship as an OTA update](#what-can-ship-as-an-ota-update)
- [Rollout stages](#rollout-stages)
- [Rollback](#rollback)
- [Minimum supported version](#minimum-supported-version)
- [Upgrade testing](#upgrade-testing)
- [Expo SDK upgrades](#expo-sdk-upgrades)

## The release flow

```
pull request ──CI──▶ main ──release-please──▶ release PR ──merge──▶ tag vX.Y.Z + GitHub release
                                                                          │
              ┌───────────────────────────────────────────────────────────┤
              ▼                                                           ▼
   EAS build (preview) → testers               EAS build (production) → Play internal track (draft)
                                                                         → TestFlight
                                                                          │ humans promote in
                                                                          ▼ Play Console / App Store Connect
                                                                   staged rollout to users

   JavaScript-only fix on a released version: EAS update (preview, then production, staged %)
```

Nothing reaches users without a person deciding it: builds and updates start by hand from `main`
(GitHub environments with required reviewers), store submissions stop at internal testing, and the
public release is a separate action in each store.

## Build variants and profiles

One codebase, four variants, chosen by `APP_VARIANT` (`apps/mobile/app.config.ts`) and set per
profile in `apps/mobile/eas.json`. Each variant has its own application id and URL scheme, so they
install side by side.

| EAS profile             | `APP_VARIANT` | Application id (placeholder)      | Distribution                     | Channel         | EAS environment | `EXPO_PUBLIC_APP_ENV` |
| ----------------------- | ------------- | --------------------------------- | -------------------------------- | --------------- | --------------- | --------------------- |
| `development`           | development   | `com.example.templateapp.dev`     | internal (devices)               | development     | development     | development           |
| `development-simulator` | development   | `com.example.templateapp.dev`     | iOS simulator                    | development     | development     | development           |
| `preview`               | preview       | `com.example.templateapp.preview` | internal (testers)               | preview         | preview         | staging               |
| `e2e`                   | e2e           | `com.example.templateapp.e2e`     | internal, no signing credentials | — (updates off) | —               | development           |
| `production`            | production    | `com.example.templateapp`         | store                            | production      | production      | production            |

- `development` builds include the dev launcher and load JavaScript from `pnpm start`.
- `preview` is a release build for QA and stakeholders, installed from an EAS link, pointing at
  staging.
- `e2e` is a release build against the local mock API, for Maestro
  ([testing.md](testing.md#end-to-end)).
- `production` goes to the stores; its build number increments automatically.

## Environment variables

Two kinds, never mixed:

**Public (`EXPO_PUBLIC_*`)** are inlined into the JavaScript bundle at build time: anyone with the
app can read them. Never a secret: no API keys with write access, no tokens, no passwords. They are
validated by `apps/mobile/src/config/env.schema.ts` when the app config is evaluated (a bad value
fails the build) and again at startup.

| Variable                                | Required                          | Value                                                                                                           |
| --------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_APP_ENV`                   | yes (set by apps/mobile/eas.json) | `development`, `staging` or `production`                                                                        |
| `EXPO_PUBLIC_API_URL`                   | yes                               | the API's base URL, no trailing slash; HTTPS outside localhost                                                  |
| `EXPO_PUBLIC_SENTRY_DSN`                | no                                | the Sentry project's DSN; unset: error reporting off                                                            |
| `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | no (default 0)                    | share of sessions traced, 0 to 1                                                                                |
| `EXPO_PUBLIC_FLAGS`                     | no                                | feature flag overrides, `name=true,other=false`; refused in production                                          |
| `EXPO_PUBLIC_STORE_URL_IOS`             | no                                | the app's App Store page (`https://apps.apple.com/…`), for the update screen; unset: the screen names the store |
| `EXPO_PUBLIC_STORE_URL_ANDROID`         | no                                | the app's Google Play page (`https://play.google.com/…`), idem                                                  |

**Build-time** variables exist only on the build machine; they never reach the bundle.

| Variable               | Kind                         | Used by                                                                                                                                                                                      |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_VARIANT`          | plain (apps/mobile/eas.json) | `apps/mobile/app.config.ts`: name, id, scheme, cleartext, updates                                                                                                                            |
| `SENTRY_ORG`           | plain                        | Sentry config plugin: uploads source maps and debug symbols during builds                                                                                                                    |
| `SENTRY_PROJECT`       | plain                        | idem                                                                                                                                                                                         |
| `SENTRY_AUTH_TOKEN`    | **secret**                   | idem; a Sentry token limited to releases and uploads                                                                                                                                         |
| `GOOGLE_SERVICES_JSON` | file, **secret**             | `apps/mobile/app.config.ts`: Android's `googleServicesFile`, the Firebase project's `google-services.json` (push notifications); unset: none ([credentials](#store-and-service-credentials)) |

Where values live:

| Context                | Source                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Local development      | `apps/mobile/.env` (copied from `apps/mobile/.env.example`, git-ignored; `pnpm start` loads it)                                      |
| EAS builds             | `apps/mobile/eas.json` `env` for the variant's fixed values; EAS environment variables for the rest                                  |
| EAS updates (workflow) | the workflow sets the variant; `--environment` loads the EAS environment's plain text and sensitive variables, never the secret ones |
| CI gates               | placeholders in `.github/workflows/quality-gates.yml` (`https://api.example.com`)                                                    |

Create the EAS environment variables once per environment (REQUIERE CONFIGURACIÓN):

```sh
eas env:create --environment production --name EXPO_PUBLIC_API_URL \
  --value https://api.<your-domain> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN \
  --value https://<key>@<host>/<project> --visibility plaintext
eas env:create --environment production --name SENTRY_ORG --value <org> --visibility plaintext
eas env:create --environment production --name SENTRY_PROJECT --value <project> --visibility plaintext
eas env:create --environment production --name SENTRY_AUTH_TOKEN \
  --value <token> --visibility secret
# Once the store pages exist (the update screen links to them):
eas env:create --environment production --name EXPO_PUBLIC_STORE_URL_IOS \
  --value https://apps.apple.com/app/id<app-id> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_STORE_URL_ANDROID \
  --value 'https://play.google.com/store/apps/details?id=<package>' --visibility plaintext
# Repeat for preview (staging API) and development.
eas env:list --environment production
```

Do not define a variable both in `apps/mobile/eas.json` and in an EAS environment: keep the
variant's fixed values (`APP_VARIANT`, `EXPO_PUBLIC_APP_ENV`) in `apps/mobile/eas.json`, everything
project-specific in EAS. A new variable is added to `env.schema.ts`, `env.ts` (Expo inlines only the
variables read there by name; `pnpm typecheck` fails when one of the schema's is missing),
`apps/mobile/.env.example`, this table and each EAS environment in the same pull request.

## Versioning

| What                                 | Source of truth                                                    | Changed by                                 |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------ |
| Version (`1.4.0`, what users see)    | `apps/mobile/package.json` `version` → `apps/mobile/app.config.ts` | release-please, from Conventional Commits  |
| Android `versionCode`                | EAS servers (`cli.appVersionSource: remote`)                       | `autoIncrement` on every production build  |
| iOS `CFBundleVersion` (build number) | EAS servers                                                        | `autoIncrement` on every production build  |
| Runtime version (OTA compatibility)  | fingerprint of the native project                                  | any native change (computed, never edited) |

- Semantic versioning for users: `feat` → minor, `fix` → patch, `!`/`BREAKING CHANGE` → major (minor
  while 0.x). The release pull request shows the next version and the changelog.
- Build numbers only go up; the stores reject a repeated one. `eas build:version:get`
  shows the current ones; `eas build:version:set` corrects them (for example when migrating an
  existing app: set them above the last uploaded build).
- An OTA update keeps the binary's version and build number; Settings → About and Sentry show the
  update id on top of them.

## First-time setup

Once per project (REQUIERE CONFIGURACIÓN), after the identity in `apps/mobile/app.config.ts` is set
([README.md](../README.md#start-a-new-project)):

1. `eas login`, then `eas init`: creates the EAS project. Copy its id to `APP.easProjectId` and the
   account to `APP.owner` in `apps/mobile/app.config.ts`. EAS Update is enabled from then on.
2. EAS environment variables for `development`, `preview` and `production`
   ([above](#environment-variables)).
3. Signing and store credentials ([below](#store-and-service-credentials)).
4. Once the first production build has created the `production` channel, protect it, so only
   a Release Manager or above can publish to it: `eas channel:protect` (choose `production`),
   where the account has protected channels (a private beta of the Enterprise plan). The
   `production` environment's `EXPO_TOKEN` then needs the Release Manager role: with the
   Developer role, the EAS update and EAS rollback workflows can no longer publish there.
5. GitHub: the `preview` and `production` environments with the `EXPO_TOKEN` secret, the rulesets
   and the repository variables ([ci-cd.md](ci-cd.md#setting-up-the-repository)).
6. A first `development` build for each platform:
   `eas build --profile development --platform all`.

## Store and service credentials

None of these is ever committed: `.gitignore` blocks the usual files (`*.jks`, `*.keystore`, `*.p8`,
`*.p12`, `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist`,
`*service-account*.json`), and the secret scanners run on every commit and pull request. They are
stored on EAS (`eas credentials`) and used by its builders and submissions.

| Credential                                     | Platform | Used for                                | How                                                                                                                                                               |
| ---------------------------------------------- | -------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload keystore                                | Android  | signing builds                          | generated and kept by EAS at the first build; Google Play App Signing holds the app key                                                                           |
| Google Play service account key                | Android  | `eas submit`                            | Play Console → API access; upload with `eas credentials` (Android → Google Service Account)                                                                       |
| FCM V1 service account key                     | Android  | push notifications                      | Firebase project; upload with `eas credentials` (Android → FCM V1)                                                                                                |
| `google-services.json`                         | Android  | push notifications (FCM), Firebase SDKs | a file-type EAS environment variable `GOOGLE_SERVICES_JSON` (`eas env:create --type file`); `apps/mobile/app.config.ts` sets `android.googleServicesFile` from it |
| Distribution certificate, provisioning profile | iOS      | signing builds                          | generated and kept by EAS with your Apple Developer account                                                                                                       |
| App Store Connect API key                      | iOS      | `eas submit`, TestFlight                | App Store Connect → Users and Access → Integrations; upload with `eas credentials`                                                                                |
| APNs key                                       | iOS      | push notifications                      | created by EAS during the first build with push, or uploaded                                                                                                      |
| `EXPO_TOKEN`                                   | —        | CI talking to EAS                       | an Expo robot user's token, secret of the GitHub environments only                                                                                                |

The Play Console requires the first upload of a new app to be done by hand (download the first
production `.aab` from EAS and upload it in the console); `eas submit` works from then on.

## Builds

Through the **EAS build** workflow ([ci-cd.md](ci-cd.md#eas-builds)): choose the profile, the
platform, a ref on `main` (a release tag for production) and, for production, whether to submit to
internal testing. Every gate runs again on that exact commit first.

Locally, for development builds (credentials are prompted or taken from EAS):

```sh
eas build --profile development --platform android
eas build --profile development-simulator --platform ios
pnpm android   # or: pnpm ios — a development build compiled on this machine
```

Production builds are not started from a laptop: the workflow guarantees they come from a reviewed
commit that passed every gate.

## Store release

**Android** — the production build is submitted to the **internal testing** track as a **draft**
(`apps/mobile/eas.json` `submit.production.android`). In Play Console: roll out to internal testers,
then closed/open testing if used, then promote to production with a **staged rollout** (for example
5 % → 20 % → 50 % → 100 %, watching crash-free users and reviews between steps). A staged rollout
can be halted at any moment.

**iOS** — the production build goes to **TestFlight** (internal testers get it after Apple's
processing). In App Store Connect: add the build to the version, fill in what is new, submit for
review, and release with **phased release** (7 days, can be paused).

Before promoting:

- [ ] Release notes written for users (the changelog is for developers).
- [ ] Tested on the TestFlight / internal-track build itself, not only on preview builds.
- [ ] Privacy declarations still true: App Store privacy labels and Play data safety (new SDKs,
      analytics events, permissions).
- [ ] Crash-free rate of the previous release known, to compare against.
- [ ] Backend changes the release depends on are already live (and backwards compatible with the
      versions still installed).

## OTA updates

EAS Update replaces the JavaScript bundle and assets of installed builds without a store release.
How the template configures it (`apps/mobile/app.config.ts`):

- **Channels**: each build is tied to its profile's channel (`preview`, `production`); an update is
  published to a channel.
- **Runtime version** (`runtimeVersion: { policy: 'fingerprint' }`): a hash of everything native
  (dependencies with native code, config plugins, native fields of the app config). An update is
  only delivered to builds with the same runtime version, so JavaScript can never run on a binary
  missing the native code it calls. `eas fingerprint:compare` shows what changed between
  the project and a build.
- **When it applies**: the app checks at launch (`checkAutomatically: 'ON_LOAD'`) without waiting
  for the result (`fallbackToCacheTimeout: 0`): the download continues in the background and the
  update runs at the next cold start. Startup never waits on the network.
- **Disabled** until `APP.easProjectId` is set, and always in the `e2e` variant (its tests run the
  embedded bundle).

Publishing goes through the **EAS update** workflow: a ref on `main`, the channel, a message and
the rollout percentage. Every gate runs on that commit first; source maps go to Sentry when the
channel's environment has `SENTRY_AUTH_TOKEN` and the repository `SENTRY_ORG` and `SENTRY_PROJECT`
(otherwise the run skips the upload with a notice, [ci-cd.md](ci-cd.md#secrets-and-variables)).
Policy:

- preview first, verified, then production;
- production starts with a partial rollout for anything non-trivial (10 %), raised with
  `eas update:edit --rollout-percentage 100` (or `update:revert-update-rollout`) once the
  crash rate holds;
- updates fix and adjust; new features go through a store release. Store policies allow updating
  interpreted code as long as the app's purpose does not change and review is not bypassed.

### Runtime versions and compatibility

```
store binary 1.4.0 (build 52) ──fingerprint──▶ runtime version A ◀── updates published while the project's fingerprint is A
store binary 1.5.0 (build 57) ──fingerprint──▶ runtime version B ◀── updates published while the project's fingerprint is B
```

- A binary asks its channel for the newest update **of its own runtime version**. An update of
  another runtime version is never offered to it: an incompatible update cannot reach a device, so
  there is nothing to crash.
- A binary with no update for its runtime version runs its embedded bundle.
- When a user installs a new store version, the app starts from that binary's embedded bundle and
  then follows the updates of its runtime version; updates downloaded for the old binary are
  discarded.
- A fix for users still on an older binary (who have not updated from the store) must be published
  from code with that binary's fingerprint: check out its release tag, apply the fix there, publish
  (`eas update:list` shows the runtime versions that have users). Otherwise ship it in a new store
  version and, if the old one is unsafe, raise the [minimum supported
  version](#minimum-supported-version).
- If an update crashes before the app finishes launching, expo-updates falls back to the previous
  update or the embedded bundle on that device by itself; roll it back for everyone anyway
  ([Rollback](#rollback)).
- The update computes its runtime version on the CI runner, the build on EAS. They agree only
  when the app config sees the same values in both places: `eas update --environment` loads the
  environment's plain text and sensitive variables, and never a secret one (they are not
  readable outside EAS servers; eas-cli 24.8.0 and Expo's documentation). Measured with
  `@expo/fingerprint` on this project: `SENTRY_ORG` and `SENTRY_PROJECT` (they add the Sentry
  config plugin) change the fingerprint, and so does the content of `GOOGLE_SERVICES_JSON` for
  Android. The first two are plain text (above). `GOOGLE_SERVICES_JSON` is a secret file: once it
  is set, an update published by the workflow gets another Android runtime version than the
  builds and reaches none of them, while `eas update` reports success (REQUIERE CONFIGURACIÓN:
  decide how both get the same file). Before relying on OTA updates for a build, check it with
  `eas fingerprint:compare --build-id <build id> --environment <channel>`: it must say the
  fingerprints match.

## What can ship as an OTA update

| Change                                                                                                                                                                        | OTA update | Store build |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| TypeScript/JavaScript: screens, logic, styles, copy                                                                                                                           | yes        |             |
| Bundled images and fonts loaded from JavaScript                                                                                                                               | yes        |             |
| `EXPO_PUBLIC_*` values (they are in the bundle)                                                                                                                               | yes        |             |
| Feature flag defaults                                                                                                                                                         | yes        |             |
| A dependency with native code: added, removed or upgraded                                                                                                                     |            | yes         |
| A config plugin or its options; permissions; `apps/mobile/app.config.ts` native fields (identifier, scheme, associated domains, intent filters, Info.plist, Android manifest) |            | yes         |
| App icon, splash screen, app name                                                                                                                                             |            | yes         |
| Expo SDK or React Native upgrade                                                                                                                                              |            | yes         |

The fingerprint enforces the right column: such a change gives a new runtime version, and an
update published after it reaches only builds made after it. The pull request template asks which
column a change is in.

## Rollout stages

From a merged commit to every user, the same order every time; each stage has its exit check:

| Stage               | Build (store version)                                  | Update (OTA)                                            | Move on when                                                                  |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1. Preview          | `preview` build, installed by the team                 | `preview` channel                                       | the change works on devices (DEFINITION_OF_DONE.md)                           |
| 2. Internal testing | `production` build: Play internal track, TestFlight    | —                                                       | testers confirm; no new crash in Sentry                                       |
| 3. Staged rollout   | Play staged rollout (5–20 %), App Store phased release | `production` channel at 5–10 % (`--rollout-percentage`) | crash-free rate holds for a day (store vitals, Sentry, `eas update:insights`) |
| 4. Production       | 100 %                                                  | `eas update:edit` to 100 %                              | —                                                                             |
| Stop at any stage   | halt the rollout / pause the phased release            | [Rollback](#rollback)                                   |                                                                               |

## Rollback

**A bad OTA update** — run the **EAS rollback** workflow ([ci-cd.md](ci-cd.md#eas-builds)):

- `earlier-update` with the group id of the last good update (`eas update:list`)
  republishes it as the newest update;
- `embedded` with the runtime version tells builds to go back to the bundle they shipped with.

Users get the rollback at their next launch. A rollback can wait behind an update that is being
published to the same channel, but no longer behind that update's gates. The workflow republishes
whatever group it is given, including one published from a laptop to another channel: the reviewer
of a production rollback checks the group id against `eas update:list --branch production` before
approving. If the update was still in a partial rollout, `eas update:revert-update-rollout` is
faster. expo-updates also falls back on its own when a new update crashes before the app finishes
launching, but that is a safety net, not a plan.

**A bad store release** — stores have no rollback:

1. Halt it: Play Console → halt the staged rollout; App Store Connect → pause the phased release.
2. If the problem is in JavaScript, fix it with an OTA update to that release's runtime version.
3. Otherwise build and submit a fixed version (higher build number), expedited review on iOS if
   needed.

Server-side changes must stay backwards compatible with every app version still in use: a mobile
release cannot be rolled back on users' phones.

## Minimum supported version

When a release must stop old versions: a security fix, an API change older apps cannot handle, a
store policy. Stores cannot force updates, so the API does:

```
app version < minimum supported version  →  the API refuses (426 Upgrade Required)  →  the app shows "Update the app" with a store link
```

Both sides are in the template; the project only sets the minimum and the store links:

1. **The app tells its version** (**in the template**): every request carries
   `X-App-Platform: ios|android`, `X-App-Version: <nativeApplicationVersion>` and
   `X-App-Build: <nativeBuildVersion>` from `expo-application` (`apps/mobile/src/api/client.ts`,
   sent by `apps/mobile/src/api/http.ts`).
2. **The API compares** it (**in the template**): with `MOBILE_MIN_VERSION_IOS` and
   `MOBILE_MIN_VERSION_ANDROID` (its configuration, not the app's; unset: any version), it answers
   426 to anything older, before any other check; requests without `X-App-Platform` and the health
   probes pass ([adr/0010-minimum-supported-app-version.md](adr/0010-minimum-supported-app-version.md)).
   Try it locally with the stack: `STACK_MOBILE_MIN_VERSION_ANDROID=99.0.0`
   ([manual.md](manual.md#55-the-production-like-stack)).
3. **The app handles that answer** (**in the template**; the store links **REQUIRE
   CONFIGURATION**): the `upgradeRequired` kind of `AppError` (never retried, never reported as a
   bug), and the update screen (`apps/mobile/src/features/update/`), the only one the root layout
   leaves available once any request got a 426. It opens the app's store page
   (`EXPO_PUBLIC_STORE_URL_IOS` / `_ANDROID`, [Environment variables](#environment-variables)), or
   names the store when they are unset. Tests: `navigation.int.spec.tsx`, `errors.spec.ts`,
   `http.spec.ts`, `UpdateRequiredScreen.spec.tsx`.
4. **Raise the minimum only after** the new version has reached most users (store rollout at 100 %
   and a few days); announce it in the release notes when possible.

The same mechanism can retire an OTA runtime version: users on a binary that can no longer get
fixes are sent to the store.

## Upgrade testing

Users upgrade from whatever version they have, with their data on the device. Before a store
release (and before an OTA update that changes stored data):

- [ ] Install the **current production version** from the store (or its `production` build) on a
      device; sign in; create data; change preferences (theme, consent); leave a notification
      unread.
- [ ] **Upgrade** to the new build (internal testing / TestFlight), without uninstalling.
- [ ] The **session** survives: no sign-in screen, the refresh token in secure storage still
      works.
- [ ] **Stored data** loads: preferences keep their values; data whose shape changed is migrated or
      falls back to defaults (persisted stores validate what they read, `apps/mobile/src/store/`; a
      persisted store whose shape changes bumps its `version` and gets a `migrate`).
- [ ] **Migrations** of local databases (SQLite tables, if the project added them) run once and
      keep the data.
- [ ] **OTA compatibility**: the new build reports a new runtime version if native code changed
      (`eas fingerprint:compare`); updates published for the old runtime still reach users who have
      not upgraded.
- [ ] **Deep links and notifications** still open the right screens.
- [ ] The same on the **oldest version still in use** (store statistics), when it is not the last
      one.

## Expo SDK upgrades

Expo releases about three SDKs a year; each supports one React Native version. Upgrade one SDK at a
time, on its own branch, when its first patch releases are out (and past the seven-day
supply-chain delay):

1. Read the SDK's changelog and breaking changes (`https://expo.dev/changelog`).
2. `pnpm --filter mobile exec expo install expo@^<next>.0.0 --fix`: the SDK and every SDK-managed
   package.
3. `pnpm expo:doctor`, `pnpm typecheck`, `pnpm lint`, `pnpm test`; fix what changed.
4. `pnpm prebuild` and a local Android/iOS build; run the Maestro flows.
5. Update `apps/mobile/eas.json` (`node`, `pnpm`) if the SDK requires newer ones. `--fix` leaves
   Jest and TypeScript alone: move Jest (and `@types/jest`) to the major the new `jest-expo` depends
   on (`pnpm view jest-expo@<next> dependencies`, `babel-jest`), and TypeScript as
   [ci-cd.md](ci-cd.md#typescript) says.
6. Measure the bundle (`pnpm build && pnpm perf:check`) and raise the budget if the SDK itself grew.
   Raise `expo-doctor` too (`pnpm --filter mobile add -D expo-doctor@latest`): Dependabot proposes only its
   patches, since its name matches the `expo-*` rule that holds the SDK's packages back.
7. It is a native change: new store builds, new runtime version; builds still on the previous SDK
   keep receiving updates published for their runtime version only.

The Expo Skills plugin for agents ([AGENTS.md](../AGENTS.md)) includes an upgrade guide.
