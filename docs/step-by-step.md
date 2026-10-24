# Step by step: from zero to the stores

Versión en español: [step-by-step.es.md](step-by-step.es.md). Both versions have the same steps; a
change to one goes to the other in the same pull request.

This is the **instructivo**: what to do, in order, from the information and accounts you need
before starting to an app published in Google Play and the App Store, and then the daily loop.
Every step says what to do, the exact command, what you should see when it worked and what to do
when it did not. The [manual](manual.md) explains how things work; this page tells you what to do
next.

How to use it:

- Follow the phases in order and do every **Check**: each one proves the steps before it worked.
- Commands run in a terminal at the project's root. On Windows use **Git Bash**.
- `<angle brackets>` are values you replace; write yours in the [worksheet](#the-worksheet).
- Some accounts take days to be approved (Apple, Google): start phase 0 first, then work on
  phases 1–7 while you wait.

## The timeline

| Phase                                                                                         | What you end up with                                                                                              | Time                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| [0. Information, decisions and accounts](#phase-0-information-decisions-and-accounts)         | the worksheet filled in; store accounts requested                                                                 | 2 h, plus **days** of approval |
| [1. Your computer](#phase-1-your-computer)                                                    | Node, pnpm, Android Studio (and Xcode on a Mac), Maestro, EAS CLI                                                 | 1–2 h                          |
| [2. Create the project](#phase-2-create-the-project)                                          | your copy with your app's identity                                                                                | 20 min                         |
| [3. Run it on an emulator](#phase-3-run-it-on-an-emulator)                                    | the app running against the mock API                                                                              | 30–45 min                      |
| [4. Prove every gate passes](#phase-4-prove-every-gate-passes)                                | the same checks as CI, green locally                                                                              | 30–60 min                      |
| [5. Put it on GitHub](#phase-5-put-it-on-github)                                              | the repository protected, CI green on a pull request                                                              | 1 h                            |
| [6. Make it yours](#phase-6-make-it-yours)                                                    | your backend, brand and features                                                                                  | days to weeks                  |
| [7. The server: the API and the public site](#phase-7-the-server-the-api-and-the-public-site) | staging and production servers running the API and the landing, deployed by the workflow; the first administrator | 2–3 h per environment          |
| [8. EAS and services](#phase-8-eas-and-services)                                              | the EAS project, its configuration and signing credentials                                                        | 1–2 h                          |
| [9. First builds on real devices](#phase-9-first-builds-on-real-devices)                      | development and preview builds installed on phones                                                                | 1–2 h                          |
| [10. The store records](#phase-10-the-store-records)                                          | the app in Play Console and App Store Connect, ready for builds                                                   | half a day                     |
| [11. The first store release](#phase-11-the-first-store-release)                              | version 1 in internal testing, then public                                                                        | 1–2 days, plus review          |
| [12. Over-the-air updates](#phase-12-over-the-air-updates)                                    | a JavaScript fix shipped without the stores; a rollback rehearsed                                                 | 1 h                            |
| [13. Monitoring](#phase-13-monitoring)                                                        | crashes and errors reported, someone watching                                                                     | 1 h                            |
| [14. Before real users](#phase-14-before-real-users)                                          | the final checklist signed off                                                                                    | half a day                     |
| [15. The daily loop](#phase-15-the-daily-loop)                                                | how every change reaches users                                                                                    | every day                      |
| [16. The maintenance calendar](#phase-16-the-maintenance-calendar)                            | what to do every week, release and quarter                                                                        | recurring                      |

---

## Phase 0. Information, decisions and accounts

### 0.1 Decide

- [ ] **The app's name** in the stores (up to 30 characters) and on the home screen (short).
- [ ] **The identifier**: reverse DNS of a domain you own, lowercase, e.g. `com.acme.portal`. It
      is the Android package and the iOS bundle id and **cannot change after the first store
      release**.
- [ ] **The URL scheme** for deep links, e.g. `acmeportal` (`acmeportal://items/42`).
- [ ] **The backend**: the included API (`apps/api`), which you extend with your features, or your
      own; and where it will run, with its staging and production HTTPS URLs. Until it runs
      somewhere, the app works against the API on your machine or the included mock API.
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

| Tool                | Install                                                                                         | Check                                    | Expected                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Git                 | Windows: Git for Windows (includes Git Bash); macOS: `xcode-select --install`                   | `git --version`                          | any current                                                      |
| Node.js 24          | nvm/fnm or the official installer (24 LTS)                                                      | `node --version`                         | `v24.15.0` or later                                              |
| pnpm                | `corepack enable` (Node.js 25 and later ship without Corepack: `npm install -g corepack` first) | `pnpm --version` (inside the project)    | `12.5.1`                                                         |
| GitHub CLI          | cli.github.com                                                                                  | `gh auth status` (after `gh auth login`) | `Logged in to github.com`                                        |
| Docker              | Docker Desktop (Windows, macOS) or Docker Engine with the Compose plugin (Linux)                | `docker compose version`                 | `Docker Compose version v2…`                                     |
| EAS CLI             | `npm install -g eas-cli`                                                                        | `eas --version`                          | `eas-cli/…` (24 or later)                                        |
| VS Code (suggested) | code.visualstudio.com                                                                           |                                          | offers the recommended extensions (Expo Tools, ESLint, Prettier) |

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

   (Why: [testing.md](testing.md#end-to-end). Alternatively build in WSL 2, or let EAS build.)

**Check** (a new terminal): `adb --version` prints a version; `emulator -list-avds` lists your
virtual device; `java -version` prints `17`.

### 1.3 Xcode (macOS only)

1. Install **Xcode** from the App Store, open it once, accept the license, install the iOS
   simulator it offers.
2. `xcode-select --install` (command line tools), then
   `sudo xcode-select -s /Applications/Xcode.app`.
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

**Check:** `ls` shows `src`, `docs`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json`.

### 2.2 Your app's identity

Open `apps/mobile/app.config.ts` and change the `APP` block:

| Field                   | Set to                               |
| ----------------------- | ------------------------------------ |
| `name`                  | the home-screen name                 |
| `slug`                  | a short lowercase id (`acme-portal`) |
| `identifier`            | your identifier (`com.acme.portal`)  |
| `scheme`                | your URL scheme (`acmeportal`)       |
| `easProjectId`, `owner` | leave for phase 8                    |
| `linkDomain`            | leave empty until phase 6            |
| `colors`                | leave until phase 6 (branding)       |

Then: the root `package.json` → `"name"`; `README.md` → title and first paragraph; `SECURITY.md` →
the security contact and the response times; `.github/CODEOWNERS` → real users or teams,
uncommented; `apps/mobile/.maestro/flows/*.yaml` and `apps/mobile/.maestro/stack/**/*.yaml` →
`APP_ID: <identifier>.e2e` and `SCHEME: <scheme>-e2e`; `apps/landing/src/lib/site.ts` → `SITE_NAME`
(the same as `name`) and `PRIVACY_EMAIL`.

**Check:** `git grep -n "com.example.templateapp"` lists only documentation (`docs/`,
`apps/mobile/.maestro/README.md`) and test fixtures (`*.spec.*`, `scripts/*.test.mjs`, `e2e/`);
`git grep -n "REQUIERE CONFIGURACIÓN"` lists what is left for later phases. (`templateapp` alone
still appears in code comments and test fixtures: that is fine.)

---

## Phase 3. Run it on an emulator

### 3.1 Install

```
corepack enable        # Node.js 25 or later: npm install -g corepack first
pnpm install
```

**Check:** it ends with `Done in …`; `git config core.hooksPath` prints `.husky/_`.

### 3.2 Local configuration

```
cp apps/mobile/.env.example apps/mobile/.env
```

It points at this repository's API (`http://localhost:3010`, phase 3.5). Until then, without
Docker, point it at the mock API: in `apps/mobile/.env`, `EXPO_PUBLIC_API_URL=http://localhost:4010`.

**Check:** `git status` does not list `apps/mobile/.env` (ignored: never commit it).

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

| Problem                                                     | Fix                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "You seem to be offline" when signing in                    | run `adb reverse tcp:4010 tcp:4010` again (after every emulator restart)                                                                 |
| `SDK location not found`                                    | `ANDROID_HOME` not set (1.2), open a new terminal                                                                                        |
| "A restricted method in java.lang.System has been called"   | `JAVA_HOME` must be JDK 17                                                                                                               |
| Windows: `CMAKE_OBJECT_PATH_MAX`, "build.ninja still dirty" | 1.2 step 6 (short path, long paths, hoisted), then `rm -rf node_modules apps/mobile/node_modules apps/mobile/android` and `pnpm install` |

From now on: `pnpm mock:api` and `pnpm start`, then open the installed app. After a native change,
`pnpm prebuild`, then `pnpm android`: `pnpm android` generates `apps/mobile/android/` only when it
is missing.

### 3.5 The real API (Docker running)

The app ran against the mock API. Now the API of this repository, on your machine:

```
cp .env.example .env
cp apps/api/.env.example apps/api/.env
openssl rand -hex 32          # paste it as JWT_ACCESS_SECRET in apps/api/.env
pnpm services:up              # PostgreSQL, Redis and Mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev                      # terminal 1, instead of pnpm mock:api
```

**Check:** `pnpm dev` prints a box with `API   http://127.0.0.1:3010/api`;
`http://127.0.0.1:3010/api/health/ready` answers `"status":"ok"`; `http://localhost:8045` (Mailpit)
opens.

Point the app at it: `EXPO_PUBLIC_API_URL=http://localhost:3010` in `apps/mobile/.env` (the value
`.env.example` ships), then
`adb reverse tcp:3010 tcp:3010` and `pnpm start` (terminal 2). Sign in with
`member@example.com` / `member-password`: the same 45 items, now from PostgreSQL. Back to the mock
API: `http://localhost:4010` and `pnpm mock:api`.

**If it fails:** a port taken by another project (`port is already allocated`): another port in the
root `.env` and the same in `apps/api/.env`; the API stops at boot naming a variable: set it in
`apps/api/.env` ([environment.md](environment.md)). More in [manual.md](manual.md#5-running-the-api).

---

## Phase 4. Prove every gate passes

### 4.1 The main gate

```
pnpm verify
```

**Check:** it ends without errors: the app's and the API's tests passed, coverage above the
thresholds of both, `expo-doctor` `21/21 checks passed`, the security checks OK, the four bundle
budget lines `ok`.

### 4.2 The API's integration tests (services up)

```
pnpm test:integration
```

**Check:** every file passes; they run on the database `app_test`, never your development data.

### 4.3 Docker-based checks (Docker running)

```
pnpm sast
pnpm lint:workflows
pnpm exec playwright install chromium   # once
pnpm --filter landing build
pnpm test:e2e                           # builds the web image the first time: a few minutes
```

**Check:** `0 findings`; `No findings to report`; `12 passed` (the landing, and the web image's app
links and their files).

### 4.4 The end-to-end flows (optional now, recommended)

With the emulator running and `pnpm mock:api` in terminal 1:

```
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 pnpm --filter mobile exec expo prebuild --platform android --clean --no-install
cd apps/mobile/android
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
cd ../../..
adb reverse tcp:4010 tcp:4010
adb shell settings put secure stylus_handwriting_enabled 0
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
pnpm test:e2e:mobile
```

**Check:** `8/8 Flows Passed`. CI runs the same on every pull request.

Then the flows against the real API and Mailpit, on the same build (`pnpm dev` in terminal 1
instead of the mock API, and the example accounts once):

```
pnpm db:seed
adb reverse tcp:4010 tcp:3010
pnpm test:e2e:mobile:stack
```

**Check:** `1/1 Flow Passed`: the account journeys (sign-up, change of email, password recovery,
account deletion).

`apps/mobile/android/` now holds the `e2e` variant: run `pnpm prebuild` before going back to
`pnpm android`.

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
   permissions**, and tick **Allow GitHub Actions to create and approve pull requests** (the
   **Release** workflow opens the release pull request with the workflow's token).
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
   checks **CI passed** and **Conventions**). On the Free plan with a private repository neither is
   available, and the environments' reviewers neither: `main-guard.yml` then reports a push to
   `main` that is not a merged pull request, and `dependabot-auto-merge.yml` checks the approval
   and CI itself, but nothing replaces the reviewers ([ci-cd.md](ci-cd.md#required-check)).

   The ruleset asks for one approval from someone other than the last person who pushed: a pull
   request needs a second member of the team. Working alone, set `required_approving_review_count`
   to `0` and `require_code_owner_review` and `require_last_push_approval` to `false` in
   `main.json` before importing it; pull requests, **CI passed**, **Conventions**, linear history
   and squash merges stay required.

7. Optional, the release token: without it, the **Release** workflow starts CI and **Conventions**
   on the release pull request itself. With a GitHub App token or a **fine-grained personal access
   token** (your avatar → Settings → Developer settings) limited to `REPO`, with **Contents**,
   **Pull requests** and **Issues** read and write, saved with `gh secret set RELEASE_PLEASE_TOKEN`,
   the release pull request runs every pull request workflow, like a person's
   ([ci-cd.md](ci-cd.md#release-pull-requests)).

**Check:** Settings → Environments lists `preview` and `production` limited to `main`; the rule for
`main` exists; if you set the release token, `gh secret list` shows `RELEASE_PLEASE_TOKEN`.

### 5.3 Prove the pull request flow

```
git switch -c chore/check-pipeline
printf '\nBuilt from the mobile template.\n' >> README.md
git commit -am "docs: check the pipeline"
git push -u origin HEAD
gh pr create --fill
gh pr checks --watch
```

**Check:** **CI passed** and **Conventions** green; a second person approves; merge with **Squash
and merge**. A `docs` or `chore` change releases nothing, so no release pull request appears yet:
the **Release** workflow opens one when the first `feat` or `fix` reaches `main`, and starts CI and
**Conventions** on it (both green on that pull request a few minutes later). Leave it open until
phase 11.

---

## Phase 6. Make it yours

Every change from here goes through [the daily loop](#phase-15-the-daily-loop).

### 6.1 Your backend

The included API is the app's backend: your features add modules to it, and the contract follows
(`pnpm contract`, [openapi/README.md](../openapi/README.md)).

1. Run it where your users can reach it, behind HTTPS, with its production settings: the server
   of [phase 7](#phase-7-the-server-the-api-and-the-public-site), staging first (you can do it now
   and come back), or your own platform ([deploy-vps.md](deploy-vps.md) says what any target must
   do). **REQUIERE CONFIGURACIÓN**.
2. Point your local `apps/mobile/.env` at staging
   (`EXPO_PUBLIC_API_URL=https://staging.acme.com`: the web image forwards `/api` to the API) and
   try the app against it; keep the mock API for the end-to-end flows.
3. Create the first administrator there (7.10).

**Another backend instead:** put its OpenAPI document in `openapi/openapi.json`, have `pnpm contract`
regenerate only the app's types (`pnpm --filter mobile api:types`), and remove `apps/api` with its
scripts and CI jobs. It must offer the session endpoints of
[openapi/README.md](../openapi/README.md) (sign-in returning an access and a refresh token, renewal
with the refresh token **in the body**, rotation); `pnpm typecheck` lists every place in the app
that no longer matches.

**Check:** sign-in, the lists and the forms work against staging; `pnpm verify` passes.

### 6.2 Your brand

1. Replace the five images in `apps/mobile/assets/images/` with your designer's, at the sizes of
   [README.md](../README.md#branding) (iOS icon without transparency; Android adaptive icon with the
   logo inside the central 66 %; notification icon white on transparent).
2. Colors: `apps/mobile/src/ui/theme/tokens.ts` (palette and light/dark colors) and `APP.colors` in
   `apps/mobile/app.config.ts`. `pnpm test` checks the contrast of text in both themes.
3. The texts of the screens (`apps/mobile/src/features/*`), the onboarding points, the app name.
4. Icons and splash are native: `pnpm prebuild`, then `pnpm android` / `pnpm ios`, to see them.

**Check:** the icon, splash and colors on the emulator are yours; `pnpm test` passes (contrast).

### 6.3 Your features

Add each one next to the items example, following
[mobile-architecture.md](mobile-architecture.md#adding-a-feature): the API's module (schemas,
service, controller, migration, tests: [architecture.md](architecture.md)) → `pnpm contract` → data
hooks → screen → route → tests → a Maestro flow for a critical journey. When yours cover the app,
delete the example: `apps/mobile/src/features/items`, its routes in `apps/mobile/src/app/(app)` (the
home tab, `(tabs)/index.tsx`, included), the `/items` links of `apps/mobile/src/lib/links.ts` and
their tests, the `newItemForm` flag, the `item_created` analytics event, its tests, the items routes
of the mock API, and `apps/mobile/.maestro/flows/03-items.yaml`; in the API, `apps/api/src/items`
(then `pnpm contract`), the seed's items, and the `items` table through a new migration
([database.md](database.md#expand-and-contract)). Flows `01` and `02` wait
for `items-list` after sign-in, and `04` opens an item link: point them at your home screen and your
own links.

### 6.4 Optional pieces

- **Deep links from your domain:** `APP.linkDomain` (the domain of the API's `APP_ORIGIN`: the
  links in its emails point to `/app/…` there), the paths in `apps/mobile/src/lib/links.ts`, and
  the app's identity on the web image (`APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`,
  `ANDROID_SHA256_CERT_FINGERPRINTS`), which then serves `/.well-known/apple-app-site-association`
  and `/.well-known/assetlinks.json` claiming `/app/*`
  ([environment.md](environment.md#web-variables),
  [mobile-architecture.md](mobile-architecture.md#deep-links)). Check them with
  `pnpm smoke --url https://<domain> --require-app-links`.
- **The landing:** the name, the privacy address, the store pages, the texts, the privacy policy's
  legal text, the share picture ([manual.md](manual.md#57-the-landing)).
- **The update screen's store links:** once the store pages exist, `EXPO_PUBLIC_STORE_URL_IOS` and
  `EXPO_PUBLIC_STORE_URL_ANDROID` in each EAS environment
  ([releases.md](releases.md#environment-variables)); the API's `MOBILE_MIN_VERSION_*` decide who
  sees it ([releases.md](releases.md#minimum-supported-version)).
- **Push notifications:** implement `PushTokenRegistrar` with your backend's endpoint
  ([mobile-architecture.md](mobile-architecture.md#notifications)); credentials in phase 8.4.
- **Analytics:** a provider in `apps/mobile/src/lib/analytics/providers.ts`.

---

## Phase 7. The server: the API and the public site

The app's server side, the API and the web image (the landing, the app's links and their files),
goes on one Linux server per environment, deployed by the **Deploy** workflow
([deploy-vps.md](deploy-vps.md) explains every piece). Do 7.0 to 7.7 twice: once for **staging**,
once for **production**. The commands use `app.acme.com`; use the domain of the environment you
are setting up: production's is the app's link domain (`APP.linkDomain`, phase 2.2), staging's
another one (`staging.acme.com`).

Steps 7.1 to 7.5 build the server and the database by hand, with any provider. On DigitalOcean,
Terraform can build the same server and a managed database instead: do 7.0, skip 7.1 to 7.5, and
go on at 7.6.

### 7.0 On DigitalOcean, 7.1 to 7.5 with Terraform (optional)

What Terraform creates, what it costs and why:
[deploy-vps.md](deploy-vps.md#provision-with-terraform-digitalocean). You need Terraform 1.17
([developer.hashicorp.com/terraform/install](https://developer.hashicorp.com/terraform/install);
`terraform version` prints `Terraform v1.17.` and any patch number) and a DigitalOcean API
token that can write (**API → Tokens**).

On your computer, the deploy key of this environment (as in 7.4), then the settings file:

```
ssh-keygen -t ed25519 -N "" -C "github-deploy-production" -f deploy_production
cd infra/terraform/digitalocean
cp terraform.tfvars.example production.tfvars
```

Edit `production.tfvars`: `project_name`, `environment`, `domain`, your SSH public key
(`admin_ssh_public_key`, the content of your `~/.ssh/id_ed25519.pub`), the content of
`deploy_production.pub` (`deploy_ssh_public_key`) and `alert_emails` (verified members of your
DigitalOcean team). Keep `admin_cidrs = ["0.0.0.0/0"]`: GitHub's runners connect over SSH from
addresses that change. Then (paste the token when `read` waits, then Enter):

```
read -rs DIGITALOCEAN_TOKEN && export DIGITALOCEAN_TOKEN
terraform init
terraform workspace new production
terraform plan -var-file=production.tfvars -out=production.tfplan
terraform apply production.tfplan
rm production.tfplan
ssh "$(terraform output -raw ssh_admin)" cloud-init status --wait
```

The first SSH connection asks whether to trust the server's key: compare its fingerprint with the
one the server shows in DigitalOcean's **Droplet Console** (log in as `ops`, run
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Then point the domain at the server, unless
`manage_dns = true` did it: the record `terraform output dns_record` shows, at your DNS provider.
Last, the database roles and the server's key for GitHub:

```
cd ../../..
pnpm iac:database
ssh-keyscan -t ed25519 app.acme.com > known_hosts_production
```

**Check:** `cloud-init status --wait` ends with `status: done`; `pnpm iac:database` ends with
`Done: the database app (owner app_migrator) and the role app_runtime.`;
`ssh -i deploy_production deploy@app.acme.com 'docker ps'` prints an empty table (headers only);
`ssh-keygen -lf known_hosts_production` shows the fingerprint you compared.

**If it fails:**

| Message                                              | Cause and fix                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`, `Unable to authenticate you`                  | `DIGITALOCEAN_TOKEN` is not exported in this terminal, or the token cannot write                                                                                                                                       |
| `Invalid value for variable`                         | the value it names in `production.tfvars`; `variables.tf` says what each one accepts                                                                                                                                   |
| `SSH Key is already in use on your account`          | this deploy key is in DigitalOcean already (another environment, an earlier attempt): one deploy key per environment, or remove the old one there (**Settings → Security**)                                            |
| `Provider produced inconsistent result after apply`  | the new reserved IP showed late in DigitalOcean's API: `terraform import -var-file=production.tfvars digitalocean_reserved_ip.app <address>` (the address in **Networking → Reserved IPs**), then plan and apply again |
| `The workspace (...) is not the environment (...)`   | `terraform workspace select production`                                                                                                                                                                                |
| `status: error`                                      | `/var/log/cloud-init-output.log` on the server says which command failed                                                                                                                                               |
| `pnpm iac:database`: `Permission denied (publickey)` | your SSH key is not the one in `admin_ssh_public_key`                                                                                                                                                                  |

### 7.1 Create the server

In your provider's console: a server with **Ubuntu 24.04 LTS**, 2 vCPU and 4 GB RAM or more, a
public IPv4, your personal SSH public key for the first login. If the provider has a firewall,
allow TCP 22, 80 and 443, and UDP 443.

**Check:** `ssh root@<server IP>` (or the user the provider names) opens a shell on the server.

### 7.2 Point the domain at it

At your DNS provider: an **A** record `app.acme.com` → the server's IPv4. No **AAAA** record: the
deployment serves IPv4 only ([deploy-vps.md](deploy-vps.md#2-create-the-server) says why).

**Check**, after a few minutes: `nslookup app.acme.com` answers the server's address.

### 7.3 Install Docker and close the firewall

Connected to the server, copy these lines one block at a time:

```
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**Check:** `docker compose version` prints `Docker Compose version v2` or later; `sudo ufw status`
lists OpenSSH, 80 and 443 as `ALLOW`.

### 7.4 Create the deploy user

On the server:

```
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -m 755 -o deploy -g deploy /srv/app
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

On **your computer**, a key for GitHub to connect with (one per environment; no passphrase):

```
ssh-keygen -t ed25519 -N "" -C "github-deploy-production" -f deploy_production
scp deploy_production.pub <your user>@app.acme.com:/tmp/deploy.pub
ssh <your user>@app.acme.com 'sudo install -m 600 -o deploy -g deploy /tmp/deploy.pub /home/deploy/.ssh/authorized_keys && rm /tmp/deploy.pub'
ssh-keyscan -t ed25519 app.acme.com > known_hosts_production
```

**Check:** `ssh -i deploy_production deploy@app.acme.com 'docker ps'` prints an empty table
(headers only). Compare the key in `known_hosts_production` with the host key your provider's
console shows (or run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server and
`ssh-keygen -lf known_hosts_production` on your computer: the fingerprints must match).

### 7.5 Create the database

**On the server** (the default): nothing to do here. 7.6 keeps `COMPOSE_PROFILES=db` in
`server.env`, and the first deployment starts PostgreSQL there and creates the database `app` and
its roles, with the passwords 7.6 generates ([deploy-vps.md](deploy-vps.md#on-this-server)).

**A managed database:** in your provider's console, a managed **PostgreSQL 16 or newer**: same
region as the server, **automated backups** and **point-in-time recovery** on, **deletion
protection** on, access only from the server's IP (or a private network). Note its host name.

Generate two passwords (`openssl rand -hex 24`, twice) and save them in the password manager. Then,
connected as the provider's administrator (`psql "<admin connection string>"`):

```sql
CREATE ROLE app_migrator LOGIN PASSWORD '<migrator password>';
GRANT app_migrator TO CURRENT_USER;
CREATE DATABASE app OWNER app_migrator;
CREATE ROLE app_runtime LOGIN PASSWORD '<runtime password>' CONNECTION LIMIT 50;
```

Then connected **as `app_migrator`** to the database `app`
(`psql "postgresql://app_migrator:<migrator password>@<host>:5432/app?sslmode=require"`):

```sql
GRANT CONNECT ON DATABASE app TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
```

**Check:** each statement answers `CREATE ROLE`, `GRANT ROLE`, `CREATE DATABASE`, `GRANT` or
`ALTER DEFAULT PRIVILEGES`, without errors. Without `GRANT app_migrator TO CURRENT_USER`,
PostgreSQL 16 and later refuse `CREATE DATABASE` (`must be able to SET ROLE "app_migrator"`): the
providers' administrators are not superusers. The migrator will own and change the schema; the
API connects as `app_runtime`, which reads and writes data only.

### 7.6 Put the deployment files on the server

From the project folder on your computer:

```
scp deploy/vps/* deploy@app.acme.com:/srv/app/
```

Later, when a release changes one of these files (Dependabot updates the Caddy, PostgreSQL and Redis
images in `deploy/vps`), the Deploy workflow stops at **Check the server's deploy files** until you
copy them again ([deploy-vps.md](deploy-vps.md#update-the-server-files)).

On the server, as `deploy` (`ssh -i deploy_production deploy@app.acme.com`), each file from its
example (with a managed database, skip `db.env` and `backup.env`):

```
cd /srv/app
chmod 755 deploy.sh rollback.sh db-init.sh backup.sh
cp server.env.example server.env
cp api.env.example api.env
cp migrate.env.example migrate.env
cp web.env.example web.env
cp redis.env.example redis.env
cp db.env.example db.env
cp backup.env.example backup.env
chmod 600 *.env
```

Then the secrets: generated on the server and written into every file that needs them, they never
show on the screen (with a managed database, leave out the `db.env` and `backup.env` lines):

```
migrator=$(openssl rand -hex 24) runtime=$(openssl rand -hex 24) backup=$(openssl rand -hex 24) redis=$(openssl rand -hex 24)
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^APP_MIGRATOR_PASSWORD=.*|APP_MIGRATOR_PASSWORD=$migrator|; s|^APP_RUNTIME_PASSWORD=.*|APP_RUNTIME_PASSWORD=$runtime|; s|^APP_BACKUP_PASSWORD=.*|APP_BACKUP_PASSWORD=$backup|" db.env
sed -i "s|^PGPASSWORD=.*|PGPASSWORD=$backup|" backup.env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis|" redis.env
sed -i "s|<APP_RUNTIME_PASSWORD>|$runtime|; s|<REDIS_PASSWORD>|$redis|; s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 32)|" api.env
sed -i "s|<APP_MIGRATOR_PASSWORD>|$migrator|" migrate.env
unset migrator runtime backup redis
```

Edit each file (`nano <file>`, save with `Ctrl+O`, exit with `Ctrl+X`):

| File          | Set                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.env`  | `APP_DOMAIN=app.acme.com`; keep `COMPOSE_PROFILES=db` (the database on the server), or delete that line (a managed database)                                                                               |
| `api.env`     | `APP_ENVIRONMENT=production` (or `staging`), `APP_ORIGIN=https://app.acme.com`; with a managed database also `DATABASE_URL=postgresql://app_runtime:<runtime password>@<db host>:5432/app?sslmode=require` |
| `migrate.env` | nothing, with the database on the server; with a managed one, `DATABASE_URL=postgresql://app_migrator:<migrator password>@<db host>:5432/app?sslmode=require`                                              |
| `web.env`     | nothing yet: the app's identity comes in phases 8 and 10 (below)                                                                                                                                           |

With Terraform (7.0), the two `DATABASE_URL` values are complete already: in
`infra/terraform/digitalocean` on your computer, `terraform output -raw database_runtime_url`
(`api.env`) and `terraform output -raw database_migrator_url` (`migrate.env`).

With a managed database on DigitalOcean or Amazon RDS, whose certificates come from the provider's
own CA, end both URLs with `?sslmode=require&uselibpqcompat=true` instead (the Terraform outputs
already do): the API would otherwise refuse the certificate (a certificate error such as
`self-signed certificate in certificate chain`,
[deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)).

**Email** (optional, but the app's sign-up, password recovery, invitations and changes of email
need it): in `api.env`, `MAIL_SMTP_URL=smtps://<user>:<password, percent-encoded>@<provider host>:465`
and `MAIL_FROM="Acme <no-reply@acme.com>"` from your email provider (Amazon SES, Postmark, Resend,
Brevo...), and at the provider, SPF, DKIM and DMARC for `acme.com`
([manual](manual.md#53-email)). After the first deployment (7.8),
`docker compose --env-file server.env --env-file release.env run --rm -T api node dist/infrastructure/mail/mail.cli.js test --to <you>`
must print `Delivered`. If it ends in `connection` or a timeout, the server may not be allowed to
send SMTP (DigitalOcean blocks ports 25, 465 and 587 on many accounts): use the provider's port 2525
(`smtp://<user>:<password>@<provider host>:2525`, STARTTLS) or ask DigitalOcean's support.

**The app's identity** (`web.env`), once you have it: the Apple Team ID and the bundle identifier
(phase 8.3, when EAS registers the app), and the Android application id with the SHA-256
fingerprint of Google's app signing key (phase 10, once Play App Signing holds it): uncomment the
four lines of `web.env` and fill them in, then recreate the web container
(`docker compose --env-file server.env --env-file release.env up -d --wait web`). Until then the
links of the emails open the open-in-app page instead of the app
([deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)).

**Check:** `ls -l /srv/app` shows every `.env` file as `-rw-------` (only `deploy` can read them),
and `grep -nE '^[^#].*(<|example\.com)|^[A-Z_]+=$' *.env` prints nothing (no placeholder, example
domain or empty value left).

### 7.7 Tell GitHub about the server

Once for the repository:

```
gh variable set DEPLOY_TARGET --body vps
gh variable set IMAGE_PREFIX --body ghcr.io/<owner>/<repo>
```

(`IMAGE_PREFIX` in lowercase: `ghcr.io/acme/acme-app`.)

The environments `staging` and `production` (Settings → Environments → New environment; deployment
branches: `main` only; production with required reviewers, as `production` already has for EAS,
[ci-cd.md](ci-cd.md#environments)). For the environment you are setting up (`production` here;
`staging` the other time):

```
gh variable set DEPLOY_HOST --env production --body app.acme.com
gh variable set PUBLIC_URL --env production --body https://app.acme.com
gh secret set DEPLOY_SSH_KEY --env production < deploy_production
gh secret set DEPLOY_KNOWN_HOSTS --env production < known_hosts_production
```

Save `deploy_production` in the password manager, then delete it and `known_hosts_production` from
your computer.

**Check:** **Settings → Environments → production** lists the variables `DEPLOY_HOST`,
`PUBLIC_URL` and the secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (next to `EXPO_TOKEN`);
**Settings → Secrets and variables → Actions → Variables** lists `DEPLOY_TARGET` and
`IMAGE_PREFIX`.

Now repeat 7.0 or 7.1–7.5, then 7.6 and 7.7, for the other environment.

### 7.8 Deploy to staging

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=main
gh run watch
```

It takes 15–25 minutes the first time. The jobs, in order: Resolve the commit → Gates → Publish
api / api-migrate / web → Release to staging (server).

**Check:** the run ends green; its summary lists the three image digests; the last step prints
`Smoke test passed (public URL only).`; https://staging.acme.com opens the landing with a valid
certificate (the padlock), and https://staging.acme.com/release.json names the commit deployed.

**If it fails:**

| Failing step                                                     | Cause and fix                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gates                                                            | the same as a red CI: open the failing job's log                                                                                                                                                                               |
| Publish: "The registry is ghcr.io"                               | `IMAGE_PREFIX` must be `ghcr.io/<owner>/<repo>` in lowercase (7.7)                                                                                                                                                             |
| Publish: "Scan the pushed image"                                 | a fixable HIGH or CRITICAL advisory in the pushed image, as in the gates' image scan: update the base image or the dependency ([security.md](security.md#container-images))                                                    |
| Environment settings                                             | a variable or secret of the environment is missing (7.7)                                                                                                                                                                       |
| Deploy on the server: `Permission denied (publickey)`            | the public key is not in `/home/deploy/.ssh/authorized_keys`, or the wrong private key in `DEPLOY_SSH_KEY` (7.4)                                                                                                               |
| `Host key verification failed`                                   | `DEPLOY_KNOWN_HOSTS` does not match the server (7.4)                                                                                                                                                                           |
| Check the server's deploy files: "Server files out of date"      | a release changed a file in `deploy/vps`: copy the files again ([deploy-vps.md](deploy-vps.md#update-the-server-files))                                                                                                        |
| `server.env is missing` (or `redis.env`, `db.env`, `backup.env`) | 7.6 not done, or not completely, on that server                                                                                                                                                                                |
| `the data services did not start`                                | PostgreSQL or Redis did not start: their logs on the server (`docker logs app-db-1`, `docker logs app-redis-1`) name the cause, usually a password of 7.6 ([troubleshooting.md](troubleshooting.md#deployment-and-operations)) |
| The migration failed                                             | `migrate.env`: wrong password, host, or the database is not reachable from the server (7.5)                                                                                                                                    |
| The rollout failed                                               | the step's log ends with the new containers' last log lines, then the previous release starts again; usually `api.env` (`DATABASE_URL`, `JWT_ACCESS_SECRET`)                                                                   |
| Smoke test, certificate errors                                   | DNS does not point at the server yet, or ports 80/443 are closed (7.2, 7.3)                                                                                                                                                    |

### 7.9 Look at it

Open https://staging.acme.com: the landing, in English, and in Spanish at `/es/`;
https://staging.acme.com/app/reset-password shows the open-in-app page. Point your local
`apps/mobile/.env` at it (`EXPO_PUBLIC_API_URL=https://staging.acme.com`, then `pnpm start`):
nobody can sign in yet, production databases have no accounts.

### 7.10 Create the first administrator

On the server, as `deploy`:

```
cd /srv/app
read -rs PASSWORD
```

Type the password (15 characters or more, a few words work well; nothing is shown), press
Enter, then:

```
printf '%s' "$PASSWORD" | docker compose --env-file server.env --env-file release.env \
  run --rm -T api node dist/users/create-user.cli.js \
  --email <first admin email> --name "<Name>" --role admin
unset PASSWORD
```

**Check:** it prints `Created the admin account <email> (<id>).`; sign in from the app with that
email and password; Settings shows **Administration**, from where the rest of the team is invited
by email.

### 7.11 Rehearse a rollback (staging)

Deploy staging once more with any later commit of `main` (7.8 with `-f ref=main` after the next
merge): the build of 7.8 becomes the release before it, the one a rollback puts back. On the
staging server:

```
cd /srv/app
./rollback.sh
```

**Check:** it prints `rollback: running <commit of 7.8>`; https://staging.acme.com/release.json
names that commit; the site and the app still work.

Then bring staging back through the workflow, as for any deployment:

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=main
gh run watch
```

**Check:** the run ends green and `release.json` names the newest commit again. Rolling back is now
something you have done, not something you read about.

### 7.12 Production

The same commit staging runs, now to production (the run waits for a reviewer: open it on GitHub →
**Review deployments** → **Approve and deploy**):

```
gh workflow run deploy.yml --ref main -f environment=production -f ref=<the commit or tag staging runs>
gh run watch
```

Then create the first administrator there (7.10). From the first store release on, deploy its tag
to staging and then to production before building the app (phase 11.1).

**Check:** the run ends green; production builds nothing (its summary lists the three digests of the
staging run, "built and scanned by run <its id>"); https://app.acme.com opens the landing, and
https://app.acme.com/release.json names the same commit as staging.

---

## Phase 8. EAS and services

Every `eas` command of this guide, from here to the maintenance calendar, runs in `apps/mobile`,
where `eas.json` and the app config are: keep a terminal open there.

### 8.1 The EAS project

```
cd apps/mobile
eas login
eas init
```

`eas init` creates the project in your Expo account (or organization) and prints its id; it cannot
edit `apps/mobile/app.config.ts` itself. Copy the values into `APP`:

```ts
easProjectId: '<the id eas init printed>',
owner: '<your Expo account or organization>',
```

**Check:** `node scripts/check-eas-project.mjs` (in `apps/mobile`) prints `EAS project <id>`. Commit
through a pull request (`chore: link the EAS project`).

### 8.2 The EAS environment variables

For each EAS environment (`development`, `preview`, `production`), the public API URL: the
servers of phase 7, staging for `development` and `preview` (the web image forwards `/api` to the
API, so the URL is the site's origin):

```
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.acme.com --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://staging.acme.com --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value https://staging.acme.com --visibility plaintext
```

With Sentry (8.4), also per environment: `EXPO_PUBLIC_SENTRY_DSN` (plaintext), `SENTRY_ORG` and
`SENTRY_PROJECT` (plaintext), `SENTRY_AUTH_TOKEN` (`--visibility secret`).

**Check:** `eas env:list --environment production` lists the variables.

### 8.3 Signing credentials

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

### 8.4 Push and error-reporting services (optional)

- **Android push:** Firebase console → your project → add an Android app with your identifier →
  download `google-services.json` (never commit it). Store it as a file-type EAS variable, per
  environment:
  `eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
  (`apps/mobile/app.config.ts` reads it). Then Project settings → Service accounts → generate a
  private key (JSON); `eas credentials -p android` → `production` → **Google Service Account →
  Manage your Google Service Account Key for Push Notifications (FCM V1)** → upload it.
- **iOS push:** `eas credentials -p ios` → `production` → **Push Notifications** → set up a key
  (EAS creates it with your Apple account).
- **Sentry:** create a **React Native** project; its DSN, your org slug, the project slug and an
  auth token (Sentry → Settings → Auth Tokens, scopes for releases and source maps) go into the EAS
  variables of 7.2. For OTA source maps also: `gh variable set SENTRY_ORG --body <org>`,
  `gh variable set SENTRY_PROJECT --body <project>`, and
  `gh secret set SENTRY_AUTH_TOKEN --env production` (and `--env preview`).

### 8.5 The token for GitHub

expo.dev → your account or organization → **Settings → Access tokens**: create a token (for an
organization, a **robot user** with the Developer role is better than a personal token; once the
production channel is protected, 11.4, the `production` one needs the Release Manager role). Then:

```
gh secret set EXPO_TOKEN --env preview
gh secret set EXPO_TOKEN --env production
```

**Check:** Settings → Environments → `production` lists `EXPO_TOKEN`.

---

## Phase 9. First builds on real devices

### 9.1 A development build for your phone

```
eas build --profile development --platform android
eas build --profile development --platform ios
```

Each prints a link and a QR code when done (about 15–30 minutes). Open it on the phone and install.
Then, on your computer, `pnpm start` and open the installed app: it connects to your computer's dev
server (same Wi-Fi network).

**Check:** the app opens on the phone, the developer menu appears when you shake it.

### 9.2 A preview build for testers

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
| `No EAS project`                                  | 8.1 not committed to `main` |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…` | 8.2 for that environment    |
| credentials errors                                | 8.3 for that profile        |
| `EXPO_TOKEN` empty or unauthorized                | 8.5 for that environment    |

---

## Phase 10. The store records

### 10.1 Google Play

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

### 10.2 App Store

1. App Store Connect → **Apps → + → New App**: iOS, name, primary language, the bundle id
   registered in 8.3 (your identifier, without suffix), a SKU.
2. **App Information**: category, content rights, age rating. **Pricing and Availability**.
   **App Privacy**: the data types (from 0.1) and the privacy policy URL.
3. **App Store Connect API key**: Users and Access → **Integrations → App Store Connect API →
   Generate API Key** (role **App Manager**); download the `.p8` (only once), note the Key ID and
   Issuer ID. Then `eas credentials -p ios` → `production` → **App Store Connect: Manage your API
   Key** → set it up with those values.
4. Copy the app's numeric **Apple ID** (App Information) into `apps/mobile/eas.json`, so automatic
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
`apps/mobile/eas.json` has the `ascAppId`.

---

## Phase 11. The first store release

### 11.1 Cut the version

Merge the release pull request, "chore(main): release <version>". The version follows from the
commits since the template's `0.1.0`: the first `fix` makes it 0.1.1, the first `feat` 0.2.0. To
start at 1.0.0 instead, first merge a pull request with the footer `Release-As: 1.0.0` added to its
commit message in the **Squash and merge** dialog. The **Release** workflow tags the release
(`v<version>`).

Then the server side of that tag, before the app: the production build talks to the production
API, which must already serve the release's contract (7.8, 7.12):

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=v<version>
gh run watch
gh workflow run deploy.yml --ref main -f environment=production -f ref=v<version>
```

**Check:** both runs end green, and https://app.acme.com/release.json names the tag's commit.

### 11.2 The first Android upload is manual (Google's rule)

Build without submitting:

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=android -f ref=v<version>
```

A reviewer approves the run (**Review deployments**). When the build finishes on expo.dev,
download the `.aab`. Play Console → **Testing → Internal testing → Create new release** → upload the
`.aab`, release notes → **Save → Review release → Start rollout to Internal testing**. Add your
testers' emails in the **Testers** tab and share the opt-in link.

### 11.3 Every later build: automatic submission

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=all -f ref=<tag> -f submit=true
```

After approval and the build, EAS submits: Android to the internal track **as a draft** (open Play
Console → Internal testing → the draft → **Start rollout**), iOS to **TestFlight** (internal
testers get it after Apple's processing, 10–30 minutes).

For the first version, run it for iOS: `-f platform=ios -f submit=true`.

**Check:** the build appears in Play Console's internal testing and in TestFlight; testers install
it and it works against the production API.

### 11.4 Protect the production update channel

The first production build created the `production` channel. Allow only a Release Manager or
above to publish to it, where the account has protected channels (a private beta of Expo's
Enterprise plan; without them, skip this step: the `production` environment's reviewer stays the
gate):

```
eas channel:protect
```

(choose `production`). **Check:** `eas channel:view production` shows it protected. From now on
the `production` environment's `EXPO_TOKEN` must belong to a Release Manager (8.5): with the
Developer role, the EAS update and EAS rollback workflows can no longer publish to production.

### 11.5 Go public

- **Google Play:** from internal testing, **promote** the release to closed testing (personal
  accounts: the 12 testers for 14 days of 0.2), then to **Production** with a **staged rollout**
  (for example 10 %), raising it while the crash-free rate holds (Android vitals).
- **App Store:** the version page → add the TestFlight build, **What's New**, screenshots, the
  review notes with the test account → **Add for Review → Submit**. Choose **phased release** for
  automatic updates. Review usually takes one or two days.

**Check:** the app is downloadable from both stores; Settings → About on a store install shows
your version and build.

---

## Phase 12. Over-the-air updates

### 12.1 Ship a JavaScript change

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
([releases.md](releases.md#what-can-ship-as-an-ota-update)).

### 12.2 Rehearse a rollback (preview)

```
eas update:list --branch preview
```

Note the group id of the update before the last one, then:

```
gh workflow run eas-rollback.yml --ref main -f channel=preview -f target=earlier-update -f group=<group id> -f message="Rollback rehearsal"
```

**Check:** after two restarts the preview app shows the earlier update id in Settings → About.

---

## Phase 13. Monitoring

1. **Sentry:** alert rules for new issues and for a spike in errors; check that a test error
   reaches it (from a preview build).
2. **Play Console → Android vitals** and **App Store Connect → TestFlight / Xcode Organizer**:
   crashes and ANRs/hangs per version.
3. **EAS:** after each update, `eas update:insights` (launches, crashes and size of an update
   group) or the project's **Updates** page on expo.dev.
4. **The server:** the uptime checks of
   [observability.md](observability.md#uptime-monitoring) (`/healthz`, the API, the app's link files;
   with Terraform, the first one exists already), the dashboards and alert rules of `observability/`
   loaded in your backend ([observability.md](observability.md#use-them-with-your-backend)), their
   notifications routed by severity ([alerting.md](alerting.md)), and the contacts table of
   [incident-response.md](incident-response.md#roles-and-contacts) filled in.
5. Who looks, how often, and who answers store reviews.

**Check:** someone on the team receives Sentry's alerts and the server's (stop the staging API for
a few minutes: the uptime check fires).

---

## Phase 14. Before real users

- [ ] [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) holds for every shipped feature.
- [ ] Tested on a small/old Android phone and a recent iPhone, largest font size, dark mode,
      TalkBack and VoiceOver, airplane mode in the middle of a request.
- [ ] The store privacy forms (data safety, App Privacy) match what the app and its SDKs collect.
- [ ] If the app lets users create accounts, it also lets them **delete their account** from the
      app (App Store requirement).
- [ ] The reviewers' test account works in production.
- [ ] Backend changes the app needs are live and compatible with every version still installed.
- [ ] The production server: a restore rehearsed ([disaster-recovery.md](disaster-recovery.md#restore-testing)),
      its backups copied off it, a rollback rehearsed on staging (7.11), and
      `pnpm smoke --url https://app.acme.com --require-app-links` passing.
- [ ] Production builds and updates require a reviewer (GitHub environment) and the production
      channel is protected where the account allows it (11.4).
- [ ] The crash-free target agreed (for example 99.5 % of sessions) and watched.
- [ ] [production-readiness.md](production-readiness.md) signed off, with
      [store-compliance.md](store-compliance.md) for both stores and the manual pass of
      [accessibility.md](accessibility.md#manual-testing).

---

## Phase 15. The daily loop

| Step                                  | Do                                                                                                                                                                                | Check                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. Start                              | `git switch main && git pull && pnpm install`, `pnpm dev` (or `pnpm mock:api`), `pnpm start`                                                                                      | the app runs                                        |
| 2. Branch                             | `git switch -c feat/<description>`                                                                                                                                                |                                                     |
| 3. Change                             | code and tests ([mobile-architecture.md](mobile-architecture.md#adding-a-feature)); `pnpm contract` if the API changed; `pnpm --filter mobile exec expo install` for a dependency | works on Android and iOS                            |
| 4. Verify                             | `pnpm verify`; `pnpm test:integration` if the API changed                                                                                                                         | green                                               |
| 5. Pull request                       | `git commit`, `git push -u origin HEAD`, `gh pr create --fill`; mark the release impact (OTA or new build)                                                                        | **CI passed** and **E2E (Android)** green, approved |
| 6. Merge                              | **Squash and merge**                                                                                                                                                              |                                                     |
| 7a. JavaScript-only change            | EAS update to `preview`, test, then `production` with a staged rollout                                                                                                            | the new update id on devices                        |
| 7b. Native change, or a store version | merge the release pull request → tag; EAS build `preview`, test; EAS build `production` with submit; promote in the stores                                                        | the new version in the stores                       |
| 8. Watch                              | Sentry, Android vitals, TestFlight feedback                                                                                                                                       | no new crashes                                      |

---

## Phase 16. The maintenance calendar

| When                                | Do                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every week                          | Approve Dependabot's pull requests: patch and minor ones merge themselves once CI is green; majors and workflow updates you merge by hand.                                                                                                                            |
| Every release                       | Preview build, test on devices, production build, internal testing, staged rollout.                                                                                                                                                                                   |
| Every Expo SDK (about three a year) | Upgrade, one SDK at a time ([releases.md](releases.md#expo-sdk-upgrades)).                                                                                                                                                                                            |
| Every quarter                       | Review `audit.ignore` and the security `overrides` in `pnpm-workspace.yaml`; the pinned EAS CLI, Maestro, Node.js and pnpm versions, and TypeScript ([ci-cd.md](ci-cd.md#keeping-the-stack-current)); `EXPO_TOKEN`'s expiration, and `RELEASE_PLEASE_TOKEN`'s if set. |
| Every year                          | Renew the Apple Developer membership and the distribution certificate (`eas credentials -p ios`) before they expire.                                                                                                                                                  |
| Every August                        | Google Play's target API level deadline: ship a build of a current Expo SDK before it.                                                                                                                                                                                |
| A PostgreSQL or Redis major         | By hand, with `docker-compose.yml`, the server's `deploy/vps/compose.yaml` and the CI images; PostgreSQL's data is dumped and restored across majors ([ci-cd.md](ci-cd.md#postgresql-and-redis)).                                                                     |
| Every month (the server)            | Remove old images and reboot when needed ([deploy-vps.md](deploy-vps.md#keep-the-server-healthy)).                                                                                                                                                                    |
| Every quarter (the server)          | A restore drill ([disaster-recovery.md](disaster-recovery.md#restore-testing)), a test alert through the routing, the copy of the backups off the server checked.                                                                                                     |

---

## When something is not in this guide

| Situation                                                              | Where                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| An error message                                                       | [troubleshooting.md](troubleshooting.md), [testing.md](testing.md#end-to-end)                                                                    |
| A change you make often (a screen, an endpoint, a deep link, an email) | [how-to.md](how-to.md)                                                                                                                           |
| The server, its backups, an incident                                   | [deploy-vps.md](deploy-vps.md), [disaster-recovery.md](disaster-recovery.md), [incident-response.md](incident-response.md)                       |
| How something works                                                    | [manual.md](manual.md)                                                                                                                           |
| The API: modules, conventions, data, errors                            | [architecture.md](architecture.md), [api-conventions.md](api-conventions.md), [database.md](database.md), [error-handling.md](error-handling.md) |
| Builds, versions, stores, updates in detail                            | [releases.md](releases.md)                                                                                                                       |
| Workflows and GitHub settings                                          | [ci-cd.md](ci-cd.md)                                                                                                                             |
| Security                                                               | [SECURITY.md](../SECURITY.md), the API's: [security.md](security.md)                                                                             |
