# Testing

What is tested where, how to write tests that catch real defects, and how to run every level,
end-to-end on a device included.

- [Levels](#levels)
- [Commands](#commands)
- [Writing tests](#writing-tests)
- [Test helpers](#test-helpers)
- [Native modules in tests](#native-modules-in-tests)
- [Coverage](#coverage)
- [End-to-end](#end-to-end)
- [Manual testing on devices](#manual-testing-on-devices)
- [Flaky tests](#flaky-tests)

## Levels

| Level       | Tool                                   | What it proves                                                                                                       | Where                                                |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit        | Jest (jest-expo)                       | logic: errors, links, redaction, env schema, session, flags, storage                                                 | `src/**/<name>.spec.ts` next to the code             |
| Component   | React Native Testing Library (RNTL 14) | a component renders, is accessible, reacts to the user                                                               | `src/ui/components/components.spec.tsx`              |
| Integration | RNTL + stubbed `fetch`                 | screen → hook → TanStack Query → API client → (stubbed) API, and back                                                | `src/features/**/*.int.spec.tsx`                     |
| Navigation  | RNTL + the real routes (`renderApp`)   | guards, redirects, deep links, not-found, error boundary, flows interrupted mid-request                              | `src/navigation.int.spec.tsx`, `src/routes.spec.tsx` |
| End-to-end  | Maestro on an emulator / simulator     | the release build works for a user: launch, onboarding, sign-in, session restore, list, create, deep links, sign-out | `.maestro/flows/`                                    |

The bulk is unit and integration tests: fast, deterministic, run on every commit. End-to-end flows
cover the critical journeys only; each one is minutes of CI time and a source of flakiness.

## Commands

```sh
pnpm test                    # every Jest test once
pnpm test:watch              # re-run on change
pnpm test:coverage           # with coverage and its thresholds (CI, pnpm verify)
pnpm test src/features/items          # a folder
pnpm test -t "rolls the optimistic"   # tests whose name matches
pnpm test:e2e                # Maestro flows, on a running emulator/simulator (see End-to-end)
pnpm test:scripts            # the repository scripts' own tests (scripts/*.test.mjs, node --test)
```

## Writing tests

Test behavior the user or the caller can observe, never implementation details:

- **Query like a user**: by role and accessible name (`getByRole('button', { name: 'Sign in' })`),
  label (`getByLabelText('Email')`) or text. A test that cannot find a control by its role usually
  found an accessibility defect: the template's own tests found two (a progress indicator and alert
  messages that screen readers did not announce). `testID` is for Maestro and for elements without
  an accessible name.
- **Interact like a user**: `userEvent` (`await user.type(...)`, `await user.press(...)`), which
  runs the press and focus events a real touch would. `fireEvent` only for events `userEvent` does
  not cover (`valueChange` on a `Switch`, scroll).
- **Everything is async in RNTL 14**: `await render(...)`, `await renderHook(...)`,
  `await fireEvent(...)`, `await rerender(...)`. Wait for results with `findBy*` or `waitFor`.
- **Stub the network, not the code**: integration tests replace `fetch`, nothing else. The screen,
  hooks, query client, HTTP pipeline, session and response validation all run for real, so the test
  breaks when any of them does.
- **One reason to fail per test**, named after the behavior (`'rolls the optimistic item back and
shows the field error the server sent'`), with the arrange/act/assert visible.
- **Test the unhappy paths**: offline, timeout, 401 and renewal, 4xx with field errors, 5xx, empty
  lists, malformed responses. They are where mobile apps break.
- **No snapshots** of component trees: they fail on every harmless change and pass on real bugs.
- **Time**: `jest.useFakeTimers()` only in the tests that need it (debounce, expiry), restored at
  the end; the session takes a `now` function so expiry is tested without waiting.

## Test helpers

`src/test/` (setup and helpers; never shipped, excluded from coverage):

| Helper                                          | What it does                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderWithProviders(ui)`                       | renders with the app's providers (theme, safe area, a fresh `testQueryClient()`)                                                                               |
| `renderApp(url)`                                | renders the real routes of `src/app` at a URL, as the app starts: guards and redirects included                                                                |
| `stubFetch(routes)`                             | replaces `fetch` with a router: `{ 'GET /api/items': () => ok(page(0, 20, 45)) }`; a request no route expects fails the test; `requests` records what was sent |
| `ok(data)`, `failure(status, message, fields?)` | API envelopes                                                                                                                                                  |
| `deferred()`                                    | a response the test resolves when it wants: assert the loading state in between                                                                                |
| `bodyOf(request)`                               | the parsed JSON body of a recorded request                                                                                                                     |
| `signInForTest(stub)`, `endTestSession(stub)`   | a signed-in session (tokens in the mocked secure storage) and its clean end                                                                                    |
| `fixtures.ts`                                   | `user`, `tokens()`, `session()`, `item()`, `page()`, typed from the contract: a contract change breaks a stale fixture at compile time                         |

Example, from `src/features/items/items.int.spec.tsx`:

```tsx
fetchStub.on('GET /api/items', () => ok(page(0, 20, 45)));
await renderWithProviders(<ItemsScreen />);
expect(await screen.findByText('Item 1')).toBeOnTheScreen();
```

`renderApp` exists because expo-router's own `renderRouter` targets RNTL 13 (synchronous render,
fake timers). Revisit it when expo-router's testing library supports RNTL 14.

## Native modules in tests

Jest runs in Node: there is no native side. `jest-expo` mocks the Expo SDK's native modules;
`src/test/setup.ts` adds stateful in-memory mocks where tests need behavior, not just a stub:

- `expo-secure-store` and `expo-sqlite/kv-store`: real key-value maps, reset before each test, so
  storage tests read back what was written;
- `expo-network`, `expo-notifications`, `expo-updates`, `expo-splash-screen`, `expo-system-ui`,
  `@sentry/react-native`, safe area: controllable mocks.

`src/test/env.ts` sets the public environment (`https://api.example.com`) before any module loads.
A new native module gets its mock in `setup.ts` (shared) or in the spec that needs it
(`jest.mock(...)`), never a real native call.

## Coverage

`pnpm test:coverage` fails below the thresholds in `jest.config.js`:

| Lines | Statements | Functions | Branches |
| ----- | ---------- | --------- | -------- |
| 97 %  | 96 %       | 94 %      | 90 %     |

They are a ratchet: set to what the template measured, rounded down. New code comes with its tests,
so the numbers hold; they are raised when coverage grows and never lowered to make a pull request
pass (a reviewer of `jest.config.js` decides). Coverage measures what ran, not what was checked: a
test without meaningful assertions raises it and proves nothing. The HTML report is in
`coverage/index.html` (CI uploads it as an artifact).

## End-to-end

[Maestro](https://maestro.mobile.dev) drives a **release build of the `e2e` variant**: the same
optimized JavaScript and native code as production, with its own application id
(`com.example.templateapp.e2e`), plain HTTP allowed to the local mock API only, and OTA updates off.
It talks to `scripts/mock-api.mjs`, an in-memory implementation of the contract, so the flows are
deterministic and need no backend or credentials.

The flows (`.maestro/flows/`, run in order by `.maestro/config.yaml`, each continuing the previous
one's state like a user's first session):

| Flow                          | Covers                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| `01-onboarding-and-sign-in`   | clean install, onboarding, on-device validation, wrong password, sign-in |
| `02-session-survives-restart` | the session restored from secure storage after the app is killed         |
| `03-items`                    | list, search, detail, form validation, create                            |
| `04-deep-links`               | an accepted link opens its screen; an unknown one lands on home          |
| `05-sign-out`                 | sign-out with confirmation, and still signed out after a restart         |

**In CI**: `.github/workflows/e2e-android.yml` builds the APK with Gradle, starts the mock API and
an Android emulator, and runs the flows on every pull request that touches the app; screenshots,
logs and a JUnit report are uploaded. The NDK React Native builds with (`ndkVersion` in
`node_modules/react-native/gradle/libs.versions.toml`) is not on the runner image: the workflow
installs it with `sdkmanager` before the build, verified and with retries, instead of leaving it to
Gradle's single download attempt. The emulator runs the AOSP system image (`target: default`),
without Google Play services: no flow needs them, and on a fresh Google image they spend the first
minutes syncing and restarting processes, which cut Maestro's connection to the device mid-flow
(`DeviceServerDiedException`). A flow that needs them (push notifications, for example) needs the
`google_apis` image and a wait for the device to settle.

The build is the slow part, and is kept short:

- **One architecture**, the emulator's (`x86_64`): a quarter of the native code of a store build.
- **No lint vital checks** (`-x lintVitalRelease`): they analyse every module for minutes, and the
  store builds on EAS still run them.
- **Caches, saved from `main` and read by pull requests:**
  - Gradle's dependencies, wrapper and build cache (`gradle/actions/setup-gradle`, `--build-cache`).
    It saves even when a build fails, so one red run does not cost the next one a full download.
  - The C and C++ compiles of the native modules (ccache), which Gradle's build cache does not
    cover.

  A first run downloads and compiles everything (about 20 minutes); later runs reuse what did not
  change. Every step has its own time limit, so a hang fails early.

- **Disk space**: the runner image leaves about 12 GB free, less than the build, its caches and
  the emulator's system image need. The job first removes toolchains it never uses (.NET, Haskell,
  Swift, Boost, CodeQL) and the image's other Android NDKs.
- **Memory for Gradle's JVMs** comes from `app.config.ts`, written into the generated
  `android/gradle.properties`, so local builds get it too. Expo's defaults (512 MB of metaspace) run
  out while the release build compiles Kotlin: `java.lang.OutOfMemoryError: Metaspace`, then
  "Gradle build daemon disappeared unexpectedly".

**Locally, Android** (Android SDK with an emulator, JDK 17, Maestro):

```sh
pnpm mock:api                                   # terminal 1: the mock API on :4010
# terminal 2, with the emulator running:
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 \
  pnpm exec expo prebuild --platform android --clean --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 && cd ..
adb reverse tcp:4010 tcp:4010                   # the emulator's localhost:4010 → this machine
adb shell settings put secure stylus_handwriting_enabled 0   # see below
adb install -r android/app/build/outputs/apk/release/app-release.apk
pnpm test:e2e
```

The same variables must be set for `./gradlew` (it bundles the JavaScript); in PowerShell use
`$env:APP_VARIANT='e2e'` and so on. Local requirements that CI (Linux) already meets:

- **JDK 17**, the version React Native supports: with JDK 24 or newer, the native modules' CMake
  configuration fails on a "restricted method" warning.
- **Stylus handwriting off on the emulator** (the `adb shell settings` line above): on recent
  Android images, Gboard's stylus tutorial can open over the keyboard and swallow the text Maestro
  types.
- **On Windows**, more requirements, all found while building this template (the C++ parts of the
  native modules are compiled with CMake and ninja):
  - a short project path (for example `C:\dev\<app>`) with Windows long paths enabled: CMake
    refuses object files whose full path exceeds 250 characters ("CMAKE_OBJECT_PATH_MAX"
    warnings, then a "broken" C++ compiler check);
  - a `node_modules` without directory junctions: with pnpm's isolated layout, ninja loops on
    "manifest 'build.ninja' still dirty after 100 tries". Set the user environment variable
    `pnpm_config_node_linker=hoisted` on that machine and run `pnpm install` again. Nothing changes
    in the repository, and CI keeps checking the isolated layout;
  - or avoid all of this: build in WSL 2, or with EAS (`eas build --profile e2e --platform
android`), and run only the emulator and Maestro on Windows.

**Locally, iOS** (macOS, Xcode, a simulator): build the `e2e` variant for the simulator, with
`APP_VARIANT=e2e` and the variables above, `pnpm exec expo run:ios --configuration Release`, or
`eas build --profile e2e --platform ios` and install the result; the simulator reaches the
Mac's `localhost` directly. Then `pnpm test:e2e`.

**Writing flows**: target `testID`s (`id:`) and visible text; wait with `extendedWaitUntil`, never
fixed sleeps; keep the mock API's data and accounts (`member@example.com` / `member-password`) as
the fixtures. `maestro studio` inspects the screen and records commands.

## Manual testing on devices

Automated tests do not replace a person using the app on real hardware before a release:
a small Android phone, a recent iPhone, the largest font size, dark mode, TalkBack/VoiceOver, a slow
or lost connection (airplane mode mid-request), backgrounding during a request, rotating if
supported, and an upgrade from the previous store version (stored data and session survive). The
[Definition of Done](../DEFINITION_OF_DONE.md) lists what each change must be checked against; the
accessibility pass follows [ACCESSIBILITY.md](ACCESSIBILITY.md#manual-testing) and the upgrade
pass [RELEASES.md](RELEASES.md#upgrade-testing).

## Flaky tests

A test that sometimes fails is a defect: fix it or delete it, never retry it into passing. Usual
causes: a missing `await` (RNTL 14 is async), asserting before data arrives (use `findBy*`), state
leaking between tests (mocked storage is reset in `setup.ts`; a spec resets the stores it uses,
as in `usePreferences.setState(DEFAULT_PREFERENCES)`),
real timers in time-dependent logic. In Maestro: a fixed wait instead of `extendedWaitUntil`, or a
flow that depends on data another flow did not create.
