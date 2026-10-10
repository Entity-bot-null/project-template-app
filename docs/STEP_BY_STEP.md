# Step by step: from zero to the stores

Versión en español: [STEP_BY_STEP.es.md](STEP_BY_STEP.es.md). Both versions have the same steps; a
change to one goes to the other in the same pull request.

This is the **instructivo**: what to do, in order, from the information and accounts you need
before starting to an app published in Google Play and the App Store, and then the daily loop.
Every step says what to do, the exact command, what you should see when it worked and what to do
when it did not. The [manual](MANUAL.md) explains how things work; this page tells you what to do
next.

How to use it:

- Follow the phases in order and do every **Check**: each one proves the steps before it worked.
- Commands run in a terminal at the project's root. On Windows use **Git Bash**.
- `<angle brackets>` are values you replace; write yours in the [worksheet](#the-worksheet).
- Some accounts take days to be approved (Apple, Google): start phase 0 first, then work on
  phases 1–6 while you wait.

## The timeline

| Phase                                                                                 | What you end up with                                              | Time                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ |
| [0. Information, decisions and accounts](#phase-0-information-decisions-and-accounts) | the worksheet filled in; store accounts requested                 | 2 h, plus **days** of approval |
| [1. Your computer](#phase-1-your-computer)                                            | Node, pnpm, Android Studio (and Xcode on a Mac), Maestro, EAS CLI | 1–2 h                          |
| [2. Create the project](#phase-2-create-the-project)                                  | your copy with your app's identity                                | 20 min                         |
| [3. Run it on an emulator](#phase-3-run-it-on-an-emulator)                            | the app running against the mock API                              | 30–45 min                      |
| [4. Prove every gate passes](#phase-4-prove-every-gate-passes)                        | the same checks as CI, green locally                              | 30–60 min                      |
| [5. Put it on GitHub](#phase-5-put-it-on-github)                                      | the repository protected, CI green on a pull request              | 1 h                            |
| [6. Make it yours](#phase-6-make-it-yours)                                            | your backend, brand and features                                  | days to weeks                  |
| [7. EAS and services](#phase-7-eas-and-services)                                      | the EAS project, its configuration and signing credentials        | 1–2 h                          |
| [8. First builds on real devices](#phase-8-first-builds-on-real-devices)              | development and preview builds installed on phones                | 1–2 h                          |
| [9. The store records](#phase-9-the-store-records)                                    | the app in Play Console and App Store Connect, ready for builds   | half a day                     |
| [10. The first store release](#phase-10-the-first-store-release)                      | version 1 in internal testing, then public                        | 1–2 days, plus review          |
| [11. Over-the-air updates](#phase-11-over-the-air-updates)                            | a JavaScript fix shipped without the stores; a rollback rehearsed | 1 h                            |
| [12. Monitoring](#phase-12-monitoring)                                                | crashes and errors reported, someone watching                     | 1 h                            |
| [13. Before real users](#phase-13-before-real-users)                                  | the final checklist signed off                                    | half a day                     |
| [14. The daily loop](#phase-14-the-daily-loop)                                        | how every change reaches users                                    | every day                      |
| [15. The maintenance calendar](#phase-15-the-maintenance-calendar)                    | what to do every week, release and quarter                        | recurring                      |

---

## Phase 0. Information, decisions and accounts

### 0.1 Decide

- [ ] **The app's name** in the stores (up to 30 characters) and on the home screen (short).
- [ ] **The identifier**: reverse DNS of a domain you own, lowercase, e.g. `com.acme.portal`. It
      is the Android package and the iOS bundle id and **cannot change after the first store
      release**.
- [ ] **The URL scheme** for deep links, e.g. `acmeportal` (`acmeportal://items/42`).
- [ ] **The backend**: the API the app talks to, its staging and production HTTPS URLs, and its
      OpenAPI contract. If it does not exist yet, the app works against the included mock API
      until it does. If it is this repository family's web template API, plan the mobile session
      endpoints (phase 6.1).
- [ ] **Links from the web** (optional): a domain for universal links/App Links
      (`app.acme.com/items/42` opening the app).
- [ ] **What data the app collects** (for the stores' privacy forms) and whether it uses analytics
      and push notifications.
- [ ] **Who** approves production builds and updates, who reviews code, who receives security
      reports and alerts.
- [ ] **Support contact**, **privacy policy URL** (both stores require one) and the **age rating**
      answers.

### 0.2 Request the accounts (start today: some take days)

| Account                                   | Cost (check current prices)                                   | Lead time                                                      | Notes                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Developer Program**               | about USD 99 per year                                         | an individual: about a day; an **organization: days to weeks** | an organization needs a **D-U-N-S number** for the legal entity (free, can take days)                                                                                                                                        |
| **Google Play Console**                   | about USD 25, once                                            | identity verification: days                                    | **personal** accounts created after November 2023 must run a **closed test with at least 12 testers for 14 days** before publishing to production (check the current rule in Play Console); organization accounts are exempt |
| **Expo** (expo.dev)                       | free tier to start; paid plans for more or faster builds      | minutes                                                        | create an **organization** if a team will share the project                                                                                                                                                                  |
| **GitHub**                                | a private repository needs **Team** (organization) or **Pro** | minutes                                                        | environments with reviewers, rulesets and branch protection depend on the plan for private repositories                                                                                                                      |
| **Firebase** (for Android push, optional) | free                                                          | minutes                                                        | a project to issue the FCM credentials                                                                                                                                                                                       |
| **Sentry** (optional)                     | free tier to start                                            | minutes                                                        | crash and error reports                                                                                                                                                                                                      |
| A **Mac** (optional)                      | —                                                             | —                                                              | iOS builds run on EAS; a Mac adds the iOS simulator and local iOS builds                                                                                                                                                     |
| A **password manager**                    | —                                                             | —                                                              | shared vault for the secrets of this guide                                                                                                                                                                                   |

### The worksheet

| Item                                                 | Value                 | Phase |
| ---------------------------------------------------- | --------------------- | ----- |
| App name (store / home screen)                       |                       | 0     |
| Identifier                                           | `com.<company>.<app>` | 0     |
| URL scheme                                           |                       | 0     |
| GitHub `OWNER/REPO`                                  |                       | 0     |
| Expo account or organization                         |                       | 0     |
| Apple Team ID                                        |                       | 0     |
| API URL staging / production                         |                       | 6     |
| Link domain (optional)                               |                       | 6     |
| EAS project id                                       |                       | 7     |
| Expo access token (`EXPO_TOKEN`)                     | password manager      | 7     |
| Sentry DSN, org, project, auth token                 | password manager      | 7     |
| Google service account key (JSON)                    | password manager      | 9     |
| App Store Connect API key (Key ID, Issuer ID, `.p8`) | password manager      | 9     |
| App Store Connect app id (numeric)                   |                       | 9     |
| Reviewer test account (email/password)               | password manager      | 9     |
| Privacy policy URL, support URL                      |                       | 9     |

**Check:** the worksheet's phase-0 lines are filled in, and the Apple and Google accounts are at
least requested.

---

## Phase 1. Your computer

### 1.1 The basics

| Tool                | Install                                                                       | Check                                    | Expected                                                         |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Git                 | Windows: Git for Windows (includes Git Bash); macOS: `xcode-select --install` | `git --version`                          | any current                                                      |
| Node.js 24          | nvm/fnm or the official installer (24 LTS)                                    | `node --version`                         | `v24.15.0` or later                                              |
| pnpm                | `corepack enable`                                                             | `pnpm --version` (inside the project)    | `12.5.1`                                                         |
| GitHub CLI          | cli.github.com                                                                | `gh auth status` (after `gh auth login`) | `Logged in to github.com`                                        |
| EAS CLI             | `npm install -g eas-cli`                                                      | `eas --version`                          | `eas-cli/…` (24 or later)                                        |
| VS Code (suggested) | code.visualstudio.com                                                         |                                          | offers the recommended extensions (Expo Tools, ESLint, Prettier) |

### 1.2 Android Studio, the SDK and an emulator

1. Install **Android Studio** (developer.android.com/studio). On first start, accept the standard
   setup: it installs the Android SDK, platform tools and an emulator.
2. **SDK Manager** (More Actions → SDK Manager): in **SDK Platforms**, the latest Android version;
   in **SDK Tools**, _Android SDK Build-Tools_, _Android SDK Platform-Tools_, _Android Emulator_,
   _NDK (Side by side)_, _CMake_.
3. **Device Manager** (More Actions → Virtual Device Manager): **Create device** → a Pixel phone →
   a recent system image with Google APIs → Finish. Start it once with ▶.
4. **JDK 17** (React Native's supported version; Android Studio's own JDK is newer): install
   Temurin 17 (adoptium.net).
5. Environment variables (Windows: System → Advanced → Environment Variables; macOS/Linux: your
   `~/.zshrc` or `~/.bashrc`):

   | Variable       | Value                                                                                                    |
   | -------------- | -------------------------------------------------------------------------------------------------------- |
   | `ANDROID_HOME` | Windows `C:\Users\<you>\AppData\Local\Android\Sdk`; macOS `~/Library/Android/sdk`; Linux `~/Android/Sdk` |
   | `JAVA_HOME`    | the JDK 17 folder                                                                                        |
   | `PATH`         | add `$ANDROID_HOME/platform-tools` and `$ANDROID_HOME/emulator`                                          |

6. **Windows only**, for native Android builds on your machine:
   - put your projects in a short folder (`C:\dev`), not deep inside your user folder;
   - enable long paths (an administrator PowerShell):
     `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`;
   - add the user environment variable `pnpm_config_node_linker` = `hoisted`.

   (Why: [TESTING.md](TESTING.md#end-to-end). Alternatively build in WSL 2, or let EAS build.)

**Check** (a new terminal): `adb --version` prints a version; `emulator -list-avds` lists your
virtual device; `java -version` prints `17`.

### 1.3 Xcode (macOS only)

1. Install **Xcode** from the App Store, open it once, accept the license, install the iOS
   simulator it offers.
2. `xcode-select --install` (command line tools), then `sudo xcode-select -s /Applications/Xcode.app`.
3. CocoaPods: `brew install cocoapods`.

**Check:** `xcrun simctl list devices available` lists iPhones; `pod --version` prints a version.

### 1.4 Maestro (end-to-end tests)

- macOS/Linux: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- Windows: download `maestro.zip` from the Maestro releases page on GitHub, unzip it to
  `C:\dev\maestro`, add `C:\dev\maestro\bin` to `PATH` (it uses the JDK 17 of 1.2).

**Check:** `maestro --version` prints a version.

---

## Phase 2. Create the project

### 2.1 Your repository from the template

On GitHub: the template repository → **Use this template → Create a new repository**, owner
`OWNER`, name `REPO`, **Private**. Then (Windows: inside `C:\dev`):

```
gh repo clone OWNER/REPO
cd REPO
```

**Check:** `ls` shows `src`, `docs`, `app.config.ts`, `eas.json`.

### 2.2 Your app's identity

Open `app.config.ts` and change the `APP` block:

| Field                   | Set to                               |
| ----------------------- | ------------------------------------ |
| `name`                  | the home-screen name                 |
| `slug`                  | a short lowercase id (`acme-portal`) |
| `identifier`            | your identifier (`com.acme.portal`)  |
| `scheme`                | your URL scheme (`acmeportal`)       |
| `easProjectId`, `owner` | leave for phase 7                    |
| `linkDomain`            | leave empty until phase 6            |
| `colors`                | leave until phase 6 (branding)       |

Then: `package.json` → `"name"`; `README.md` → title and first paragraph; `SECURITY.md` → the
security contact and the response times; `.github/CODEOWNERS` → real users or teams, uncommented;
`.maestro/flows/*.yaml` → `APP_ID: <identifier>.e2e` and `SCHEME: <scheme>-e2e`.

**Check:** `git grep -n "com.example.templateapp"` lists only documentation (`docs/`,
`.maestro/README.md`); `git grep -n "REQUIERE CONFIGURACIÓN"` lists what is left for later
phases. (`templateapp` alone still appears in code comments and test fixtures: that is fine.)

---

## Phase 3. Run it on an emulator

### 3.1 Install

```
corepack enable
pnpm install
```

**Check:** it ends with `Done in …`; `git config core.hooksPath` prints `.husky/_`.

### 3.2 Local configuration

```
cp .env.example .env
```

It already points at the mock API (`http://localhost:4010`). Nothing else to set.

**Check:** `git status` does not list `.env` (ignored: never commit it).

### 3.3 Start the mock API (terminal 1)

```
pnpm mock:api
```

**Check:** it prints `Mock API on http://127.0.0.1:4010`. Leave it running.

### 3.4 Build and run the app (terminal 2)

Start the emulator from Android Studio's Device Manager (or `emulator -avd <name>`), then:

```
adb reverse tcp:4010 tcp:4010
pnpm android
```

The first build takes 10–20 minutes (it compiles the native code); later ones are much faster.

**Check**, on the emulator:

| Do                                                    | You should see                                 |
| ----------------------------------------------------- | ---------------------------------------------- |
| the app opens                                         | the **Welcome** screen                         |
| tap **Get started**                                   | the **Sign in** screen                         |
| sign in with `member@example.com` / `member-password` | the **Items** list (45 items)                  |
| type `7` in Search                                    | the list filters to items with a 7             |
| tap an item                                           | its detail screen                              |
| back, then **New item**, a title, **Create**          | the item appears at the top of the list        |
| **Settings** tab                                      | your profile, theme options, version and build |
| switch the theme to Dark                              | the whole app turns dark                       |
| **Sign out** and confirm                              | the Sign in screen                             |

**iOS (on a Mac):** `pnpm ios` instead of `pnpm android` (the simulator reaches the mock API
directly; no `adb reverse`).

**If it fails:**

| Problem                                                     | Fix                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| "You seem to be offline" when signing in                    | run `adb reverse tcp:4010 tcp:4010` again (after every emulator restart)                            |
| `SDK location not found`                                    | `ANDROID_HOME` not set (1.2), open a new terminal                                                   |
| "A restricted method in java.lang.System has been called"   | `JAVA_HOME` must be JDK 17                                                                          |
| Windows: `CMAKE_OBJECT_PATH_MAX`, "build.ninja still dirty" | 1.2 step 6 (short path, long paths, hoisted), then `rm -rf node_modules android` and `pnpm install` |

From now on: `pnpm mock:api` and `pnpm start`, then open the installed app. After a native change,
`pnpm prebuild`, then `pnpm android`: `pnpm android` generates `android/` only when it is missing.

---

## Phase 4. Prove every gate passes

### 4.1 The main gate

```
pnpm verify
```

**Check:** it ends without errors: 200+ tests passed, coverage above the thresholds,
`expo-doctor` `21/21 checks passed`, the security checks OK, the four bundle budget lines `ok`.

### 4.2 Docker-based checks (Docker running)

```
pnpm sast
pnpm lint:workflows
```

**Check:** `0 findings`; `No findings to report`.

### 4.3 The end-to-end flows (optional now, recommended)

With the emulator running and `pnpm mock:api` in terminal 1:

```
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 pnpm exec expo prebuild --platform android --clean --no-install
cd android
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
cd ..
adb reverse tcp:4010 tcp:4010
adb shell settings put secure stylus_handwriting_enabled 0
adb install -r android/app/build/outputs/apk/release/app-release.apk
pnpm test:e2e
```

**Check:** `5/5 Flows Passed`. CI runs the same on every pull request.

`android/` now holds the `e2e` variant: run `pnpm prebuild` before going back to `pnpm android`.

---

## Phase 5. Put it on GitHub

### 5.1 First push

```
git add -A
git commit -m "chore: start from the mobile template"
git push --no-verify -u origin main
```

(`--no-verify` only this once: the hook refuses pushes to `main` afterwards.)

**Check:** GitHub → **Actions** shows **CI** and **E2E (Android)** running on `main`, ending green.

### 5.2 Repository settings

GitHub → **Settings**:

1. **General → Pull Requests**: only **squash merging**, default message **Pull request title**,
   **Automatically delete head branches**.
2. **Actions → General → Workflow permissions**: **Read repository contents and packages
   permissions**.
3. **Environments → New environment** `preview`: deployment branches **Selected branches** →
   `main`.
4. **Environments → New environment** `production`: the same, plus **Required reviewers** (tick
   **Prevent self-review**).
5. **Code security**: Dependabot alerts and security updates, secret scanning with push protection
   (if available), private vulnerability reporting.
6. **Rules → Rulesets** (Team plan or public repository):

   ```
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/main.json
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/tags.json
   ```

   With GitHub Pro instead: a branch protection rule on `main` (a pull request, one approval, the
   check **CI passed**). On the Free plan with a private repository neither is available, and the
   environments' reviewers neither: `main-guard.yml` then reports a push to `main` that is not a
   merged pull request, and `dependabot-auto-merge.yml` checks the approval and CI itself, but
   nothing replaces the reviewers ([CI_CD.md](CI_CD.md#required-check)).

7. The release token (so CI runs on release pull requests): a **fine-grained personal access
   token** (your avatar → Settings → Developer settings) limited to `REPO`, with **Contents**,
   **Pull requests** and **Issues** read and write; then `gh secret set RELEASE_PLEASE_TOKEN`.

**Check:** Settings → Environments lists `preview` and `production` limited to `main`; the rule for
`main` exists; `gh secret list` shows `RELEASE_PLEASE_TOKEN`.

### 5.3 Prove the pull request flow

```
git switch -c chore/check-pipeline
echo "" >> README.md
git commit -am "docs: check the pipeline"
git push -u origin HEAD
gh pr create --fill
gh pr checks --watch
```

**Check:** **CI passed** green; merge with **Squash and merge**. The **Release** workflow then opens
"chore(main): release 0.1.0": leave it open until phase 10.

---

## Phase 6. Make it yours

Every change from here goes through [the daily loop](#phase-14-the-daily-loop).

### 6.1 Connect your backend

1. Put your API's OpenAPI document in `openapi/openapi.json`, then `pnpm contract`.
2. `pnpm typecheck` lists every place that no longer matches: fix the Zod schemas and hooks in
   `src/features/*/api.ts` and `src/auth/schemas.ts`.
3. The app expects the session endpoints of [openapi/README.md](../openapi/README.md#what-the-app-expects-from-the-api)
   (sign-in returning an access and a refresh token, renewal with the refresh token **in the
   body**, rotation). A backend built for browsers only (like the web template's API, with an
   HTTP-only cookie) needs those endpoints added for mobile clients.
4. Point your local `.env` at your staging API (`EXPO_PUBLIC_API_URL=https://staging-api.acme.com`)
   and try the app against it; keep the mock API for tests.

**Check:** sign-in, the lists and the forms work against staging; `pnpm verify` passes.

### 6.2 Your brand

1. Replace the five images in `assets/images/` with your designer's, at the sizes of
   [README.md](../README.md#branding) (iOS icon without transparency; Android adaptive icon with the
   logo inside the central 66 %; notification icon white on transparent).
2. Colors: `src/ui/theme/tokens.ts` (palette and light/dark colors) and `APP.colors` in
   `app.config.ts`. `pnpm test` checks the contrast of text in both themes.
3. The texts of the screens (`src/features/*`), the onboarding points, the app name.
4. Icons and splash are native: `pnpm prebuild`, then `pnpm android` / `pnpm ios`, to see them.

**Check:** the icon, splash and colors on the emulator are yours; `pnpm test` passes (contrast).

### 6.3 Your features

Add each one next to `src/features/items`, following
[MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#adding-a-feature): contract → data hooks → screen →
route → tests → a Maestro flow for a critical journey. When yours cover the app, delete the example:
`src/features/items`, its routes in `src/app/(app)` (the home tab, `(tabs)/index.tsx`, included),
the `/items` links of `src/lib/links.ts` and their tests, the `newItemForm` flag, the `item_created`
analytics event, its tests, the items paths of the contract and the mock API, and
`.maestro/flows/03-items.yaml`. Flows `01` and `02` wait for `items-list` after sign-in, and `04`
opens an item link: point them at your home screen and your own links.

### 6.4 Optional pieces

- **Deep links from your domain:** `APP.linkDomain`, the paths in `src/lib/links.ts`, and the files
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on that domain
  ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#deep-links)).
- **Push notifications:** implement `PushTokenRegistrar` with your backend's endpoint
  ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#notifications)); credentials in phase 7.4.
- **Analytics:** a provider in `src/lib/analytics/providers.ts`.

---

## Phase 7. EAS and services

### 7.1 The EAS project

```
eas login
eas init
```

`eas init` creates the project in your Expo account (or organization) and prints its id; it cannot
edit `app.config.ts` itself. Copy the values into `APP`:

```ts
easProjectId: '<the id eas init printed>',
owner: '<your Expo account or organization>',
```

**Check:** `node scripts/check-eas-project.mjs` prints `EAS project <id>`. Commit through a pull
request (`chore: link the EAS project`).

### 7.2 The EAS environment variables

For each EAS environment (`development`, `preview`, `production`), the public API URL (the staging
API for `development` and `preview`):

```
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.acme.com --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://staging-api.acme.com --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value https://staging-api.acme.com --visibility plaintext
```

With Sentry (7.4), also per environment: `EXPO_PUBLIC_SENTRY_DSN` (plaintext), `SENTRY_ORG` and
`SENTRY_PROJECT` (plaintext), `SENTRY_AUTH_TOKEN` (`--visibility secret`).

**Check:** `eas env:list --environment production` lists the variables.

### 7.3 Signing credentials

EAS creates and stores them; nothing goes into the repository. Interactive, once per platform:

```
eas credentials -p android
```

Choose the `production` build profile → **Keystore → Set up a new keystore**; repeat for
`preview`.

```
eas credentials -p ios
```

Sign in with your Apple ID when asked (it registers the bundle ids and creates the certificate and
profiles). For each of `production`, `preview` and `development`: **Build Credentials → Set up all
the required credentials**.

Internal iOS builds (`development`, `preview`) only install on registered iPhones. Register each
tester's device:

```
eas device:create
```

It prints a link or QR code: open it on the iPhone and install the profile it offers.

**Check:** `eas credentials -p android` and `-p ios` show credentials for each profile;
`eas device:list` lists the registered iPhones.

### 7.4 Push and error-reporting services (optional)

- **Android push:** Firebase console → your project → add an Android app with your identifier →
  download `google-services.json` (never commit it). Store it as a file-type EAS variable, per
  environment: `eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
  (`app.config.ts` reads it). Then Project settings → Service accounts → generate a private key
  (JSON); `eas credentials -p android` → `production` → **Google Service Account → Manage your
  Google Service Account Key for Push Notifications (FCM V1)** → upload it.
- **iOS push:** `eas credentials -p ios` → `production` → **Push Notifications** → set up a key
  (EAS creates it with your Apple account).
- **Sentry:** create a **React Native** project; its DSN, your org slug, the project slug and an
  auth token (Sentry → Settings → Auth Tokens, scopes for releases and source maps) go into the EAS
  variables of 7.2. For OTA source maps also: `gh variable set SENTRY_ORG --body <org>`,
  `gh variable set SENTRY_PROJECT --body <project>`, and
  `gh secret set SENTRY_AUTH_TOKEN --env production` (and `--env preview`).

### 7.5 The token for GitHub

expo.dev → your account or organization → **Settings → Access tokens**: create a token (for an
organization, a **robot user** with the Developer role is better than a personal token). Then:

```
gh secret set EXPO_TOKEN --env preview
gh secret set EXPO_TOKEN --env production
```

**Check:** Settings → Environments → `production` lists `EXPO_TOKEN`.

---

## Phase 8. First builds on real devices

### 8.1 A development build for your phone

```
eas build --profile development --platform android
eas build --profile development --platform ios
```

Each prints a link and a QR code when done (about 15–30 minutes). Open it on the phone and install.
Then, on your computer, `pnpm start` and open the installed app: it connects to your computer's dev
server (same Wi-Fi network).

**Check:** the app opens on the phone, the developer menu appears when you shake it.

### 8.2 A preview build for testers

GitHub → **Actions → EAS build → Run workflow** (from `main`): profile `preview`, platform `all`,
ref `main`. Or:

```
gh workflow run eas-build.yml --ref main -f profile=preview -f platform=all -f ref=main
gh run watch
```

The workflow runs every gate on that commit, then queues the builds on EAS; follow them on
expo.dev → your project → Builds.

**Check:** the builds finish; testers install them from the build page link (Android: the APK;
iPhone: registered devices only) and the app talks to your staging API. Test it with the checklist
of [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md#devices-and-platforms).

**If it fails:**

| Message                                           | Fix                         |
| ------------------------------------------------- | --------------------------- |
| `No EAS project`                                  | 7.1 not committed to `main` |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…` | 7.2 for that environment    |
| credentials errors                                | 7.3 for that profile        |
| `EXPO_TOKEN` empty or unauthorized                | 7.5 for that environment    |

---

## Phase 9. The store records

### 9.1 Google Play

1. Play Console → **Create app**: name, default language, App, Free or Paid, accept the
   declarations.
2. **Dashboard → Set up your app**, every task: privacy policy URL, **app access** (give the review
   team a test account), ads, content rating questionnaire, target audience, **data safety** (what
   the app collects, from 0.1), and the other declarations.
3. **Store listing**: short and full description, the 512×512 icon, the 1024×500 feature graphic,
   at least two phone screenshots.
4. **Service account for automatic submissions:** Google Cloud console → the project linked to
   Play Console → IAM → **Service accounts → Create** → **Keys → Add key → JSON** (download). In
   Play Console → **Users and permissions → Invite new users** → the service account's email →
   permissions to manage releases for this app. Then:

   ```
   eas credentials -p android
   ```

   → `production` → **Google Service Account → Upload a Google Service Account Key** for
   submissions → the JSON file.

**Check:** the dashboard shows the setup tasks done; `eas credentials -p android` shows the
submission key.

### 9.2 App Store

1. App Store Connect → **Apps → + → New App**: iOS, name, primary language, the bundle id
   registered in 7.3 (your identifier, without suffix), a SKU.
2. **App Information**: category, content rights, age rating. **Pricing and Availability**.
   **App Privacy**: the data types (from 0.1) and the privacy policy URL.
3. **App Store Connect API key**: Users and Access → **Integrations → App Store Connect API →
   Generate API Key** (role **App Manager**); download the `.p8` (only once), note the Key ID and
   Issuer ID. Then `eas credentials -p ios` → `production` → **App Store Connect: Manage your API
   Key** → set it up with those values.
4. Copy the app's numeric **Apple ID** (App Information) into `eas.json`, so automatic
   submissions know which app to upload to (it is not a secret):

   ```json
   "submit": {
     "production": {
       "android": { "track": "internal", "releaseStatus": "draft" },
       "ios": { "ascAppId": "<numeric Apple ID>" }
     }
   }
   ```

   Commit it through a pull request.

**Check:** the app record exists in App Store Connect; `eas credentials -p ios` shows the API key;
`eas.json` has the `ascAppId`.

---

## Phase 10. The first store release

### 10.1 Cut the version

Merge the release pull request "chore(main): release 0.1.0" (or, to start at 1.0.0, first merge a
commit whose message has the footer `Release-As: 1.0.0`). The **Release** workflow tags it
(`v0.1.0`).

### 10.2 The first Android upload is manual (Google's rule)

Build without submitting:

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=android -f ref=v0.1.0
```

A reviewer approves the run (**Review deployments**). When the build finishes on expo.dev,
download the `.aab`. Play Console → **Testing → Internal testing → Create new release** → upload the
`.aab`, release notes → **Save → Review release → Start rollout to Internal testing**. Add your
testers' emails in the **Testers** tab and share the opt-in link.

### 10.3 Every later build: automatic submission

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=all -f ref=<tag> -f submit=true
```

After approval and the build, EAS submits: Android to the internal track **as a draft** (open Play
Console → Internal testing → the draft → **Start rollout**), iOS to **TestFlight** (internal
testers get it after Apple's processing, 10–30 minutes).

For the first version, run it for iOS: `-f platform=ios -f submit=true`.

**Check:** the build appears in Play Console's internal testing and in TestFlight; testers install
it and it works against the production API.

### 10.4 Protect the production update channel

The first production build created the `production` channel. Allow only account admins to publish
to it:

```
eas channel:protect
```

(choose `production`). **Check:** `eas channel:view production` shows it protected.

### 10.5 Go public

- **Google Play:** from internal testing, **promote** the release to closed testing (personal
  accounts: the 12 testers for 14 days of 0.2), then to **Production** with a **staged rollout**
  (for example 10 %), raising it while the crash-free rate holds (Android vitals).
- **App Store:** the version page → add the TestFlight build, **What's New**, screenshots, the
  review notes with the test account → **Add for Review → Submit**. Choose **phased release** for
  automatic updates. Review usually takes one or two days.

**Check:** the app is downloadable from both stores; Settings → About on a store install shows
your version and build.

---

## Phase 11. Over-the-air updates

### 11.1 Ship a JavaScript change

1. A small visible JavaScript change (a text) through a pull request, merged.
2. To preview first:

   ```
   gh workflow run eas-update.yml --ref main -f channel=preview -f ref=main -f message="Fix the settings text" -f rollout=100
   ```

3. On a preview build: open the app, close it completely, open it again (the update downloads in
   the background and applies on the next start). Settings → About shows the new **Update** id.
4. Then production, starting small:

   ```
   gh workflow run eas-update.yml --ref main -f channel=production -f ref=main -f message="Fix the settings text" -f rollout=10
   ```

   After a day without new errors: `eas update:edit` → raise to 100 %.

Only JavaScript and assets can ship this way; a native change needs a new build
([RELEASES.md](RELEASES.md#what-can-ship-as-an-ota-update)).

### 11.2 Rehearse a rollback (preview)

```
eas update:list --branch preview
```

Note the group id of the update before the last one, then:

```
gh workflow run eas-rollback.yml --ref main -f channel=preview -f target=earlier-update -f group=<group id> -f message="Rollback rehearsal"
```

**Check:** after two restarts the preview app shows the earlier update id in Settings → About.

---

## Phase 12. Monitoring

1. **Sentry:** alert rules for new issues and for a spike in errors; check that a test error
   reaches it (from a preview build).
2. **Play Console → Android vitals** and **App Store Connect → TestFlight / Xcode Organizer**:
   crashes and ANRs/hangs per version.
3. **EAS:** after each update, `eas update:insights` (launches, crashes and size of an update
   group) or the project's **Updates** page on expo.dev.
4. Who looks, how often, and who answers store reviews.

**Check:** someone on the team receives Sentry's alerts.

---

## Phase 13. Before real users

- [ ] [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) holds for every shipped feature.
- [ ] Tested on a small/old Android phone and a recent iPhone, largest font size, dark mode,
      TalkBack and VoiceOver, airplane mode in the middle of a request.
- [ ] The store privacy forms (data safety, App Privacy) match what the app and its SDKs collect.
- [ ] If the app lets users create accounts, it also lets them **delete their account** from the
      app (App Store requirement).
- [ ] The reviewers' test account works in production.
- [ ] Backend changes the app needs are live and compatible with every version still installed.
- [ ] Production builds and updates require a reviewer (GitHub environment) and the production
      channel is protected (10.4).
- [ ] The crash-free target agreed (for example 99.5 % of sessions) and watched.
- [ ] [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) signed off, with
      [STORE_COMPLIANCE.md](STORE_COMPLIANCE.md) for both stores and the manual pass of
      [ACCESSIBILITY.md](ACCESSIBILITY.md#manual-testing).

---

## Phase 14. The daily loop

| Step                                  | Do                                                                                                                                                                | Check                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. Start                              | `git switch main && git pull && pnpm install`, `pnpm mock:api`, `pnpm start`                                                                                      | the app runs                                        |
| 2. Branch                             | `git switch -c feat/<description>`                                                                                                                                |                                                     |
| 3. Change                             | code and tests ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#adding-a-feature)); `pnpm contract` if the API changed; `pnpm exec expo install` for a dependency | works on Android and iOS                            |
| 4. Verify                             | `pnpm verify`                                                                                                                                                     | green                                               |
| 5. Pull request                       | `git commit`, `git push -u origin HEAD`, `gh pr create --fill`; mark the release impact (OTA or new build)                                                        | **CI passed** and **E2E (Android)** green, approved |
| 6. Merge                              | **Squash and merge**                                                                                                                                              |                                                     |
| 7a. JavaScript-only change            | EAS update to `preview`, test, then `production` with a staged rollout                                                                                            | the new update id on devices                        |
| 7b. Native change, or a store version | merge the release pull request → tag; EAS build `preview`, test; EAS build `production` with submit; promote in the stores                                        | the new version in the stores                       |
| 8. Watch                              | Sentry, Android vitals, TestFlight feedback                                                                                                                       | no new crashes                                      |

---

## Phase 15. The maintenance calendar

| When                                | Do                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every week                          | Approve Dependabot's pull requests: patch and minor ones merge themselves once CI is green; majors and workflow updates you merge by hand.                                          |
| Every release                       | Preview build, test on devices, production build, internal testing, staged rollout.                                                                                                 |
| Every Expo SDK (about three a year) | Upgrade, one SDK at a time ([RELEASES.md](RELEASES.md#expo-sdk-upgrades)).                                                                                                          |
| Every quarter                       | Review `audit.ignore` and the security `overrides` in `pnpm-workspace.yaml`; the pinned EAS CLI, Maestro and Node versions; `RELEASE_PLEASE_TOKEN`'s and `EXPO_TOKEN`'s expiration. |
| Every year                          | Renew the Apple Developer membership and the distribution certificate (`eas credentials -p ios`) before they expire.                                                                |
| Every August                        | Google Play's target API level deadline: ship a build of a current Expo SDK before it.                                                                                              |

---

## When something is not in this guide

| Situation                                   | Where                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| An error message                            | [README.md](../README.md#troubleshooting), [TESTING.md](TESTING.md#end-to-end) |
| How something works                         | [MANUAL.md](MANUAL.md)                                                         |
| Builds, versions, stores, updates in detail | [RELEASES.md](RELEASES.md)                                                     |
| Workflows and GitHub settings               | [CI_CD.md](CI_CD.md)                                                           |
| Security                                    | [SECURITY.md](../SECURITY.md)                                                  |
