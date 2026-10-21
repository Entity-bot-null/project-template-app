# Instructions for AI coding agents

This is an Expo / React Native mobile application (Android and iOS) for commercial release.
Prioritize mobile-first patterns, performance, accessibility and cross-platform behavior.

The repository is a pnpm workspace: the app is the package `mobile` in `apps/mobile`; the root holds
the repository's tooling (hooks, gates, CI, supply-chain settings) and runs every command
([docs/adr/0002-pnpm-monorepo.md](docs/adr/0002-pnpm-monorepo.md)). Paths below start at the
repository root.

Read [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) first, then the doc for the area you
touch: [docs/mobile-architecture.md](docs/mobile-architecture.md) (layers, navigation, state, API,
auth, storage, errors, native code), [docs/testing.md](docs/testing.md),
[docs/performance.md](docs/performance.md), [docs/releases.md](docs/releases.md),
[SECURITY.md](SECURITY.md). A change is done when it meets
[DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).

This file is the shared context for every agent (Claude Code reads it through `CLAUDE.md`; Codex,
Cursor and other tools read `AGENTS.md`). Tools with their own rules files should point them here
instead of copying it.

## Expo has changed: do not trust your training data

Expo ships breaking changes every SDK release; APIs you remember may be renamed, moved or removed.
Before writing code that touches an Expo, EAS or React Native API:

1. Read the major version of `expo` in `apps/mobile/package.json` (this template: SDK 57).
2. Use the docs of that version: `https://docs.expo.dev/versions/v57.0.0/` (append `.md` to a docs
   URL for a Markdown version).
3. For anything else, start from `https://docs.expo.dev/llms.txt`, an index of the Expo docs with
   corrections to common LLM misconceptions, and follow it to the page you need. Never answer from
   memory.

Expo's tooling for agents, already configured in this repository:

- **Expo plugin for Claude Code** (Expo Skills: SDK upgrades, EAS, native UI…), enabled in
  `.claude/settings.json`. Install it once: `claude plugin install expo@claude-plugins-official`.
- **Expo MCP server** (`https://mcp.expo.dev/mcp`: live docs, EAS builds and updates), declared in
  `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor); sign in with `/mcp` in Claude Code.
  Codex: `codex mcp add expo --url https://mcp.expo.dev/mcp`.

## Commands

pnpm only (`pnpm-lock.yaml`); never `npm`, `yarn` or `bunx` for the project. Run commands from the
repository root; `pnpm --filter mobile <script>` runs one of the app's own scripts
(`apps/mobile/package.json`). A dependency goes to the package that uses it: the app's with
`expo install` (below), the repository's tooling with `pnpm add -D -w <package>`. EAS CLI is not a
project dependency (expo-doctor refuses it): `eas <command>` from a global install, or
`pnpm dlx eas-cli <command>`, run in `apps/mobile` (where `eas.json` is); the CI workflows pin its
version (`EAS_CLI_VERSION`).

```sh
pnpm --filter mobile exec expo install <package>   # ALWAYS to add a dependency to the app: SDK-compatible versions
EXPO_OFFLINE=1 pnpm --filter mobile exec expo install --check   # versions that do not match the installed SDK
pnpm start                         # dev server (needs a development build, not Expo Go)
pnpm android | pnpm ios            # compile and run a development build locally
pnpm prebuild                      # regenerate apps/mobile/android/ and apps/mobile/ios/: after a native change
pnpm mock:api                      # local implementation of openapi/openapi.json on :4010
pnpm lint                          # ESLint, zero warnings
pnpm typecheck                     # contract drift + typed routes + tsc
pnpm test                          # Jest (unit, component, integration)
pnpm test:scripts                  # tests of the repository's scripts
pnpm expo:doctor                   # expo-doctor
pnpm contract                      # regenerate apps/mobile/src/api/schema.d.ts from openapi/openapi.json
pnpm verify                        # the local gates: run before declaring a task done
```

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before declaring any task done; `pnpm verify`
before a pull request.

## Rules

- **Native projects are generated.** `apps/mobile/android/` and `apps/mobile/ios/` are produced by
  `expo prebuild` (Continuous Native Generation) and never committed or edited by hand. Configure
  native behavior in `apps/mobile/app.config.ts` and config plugins
  ([native code](docs/mobile-architecture.md#native-code)).
- **No Expo Go.** After adding a library with native code, the app needs a new development build.
  A native change also means a new store build: it cannot ship as an OTA update.
- **Dependencies**: prefer Expo SDK modules, then maintained New Architecture libraries
  (reactnative.directory). Add with `pnpm --filter mobile exec expo install`, justify every new
  dependency in the pull request, and never pin an older version than the SDK expects.
  `pnpm expo:doctor` must pass.
- **Routes** live in `apps/mobile/src/app/` (Expo Router): every file there is a route,
  `_layout.tsx` files are navigators. Routes stay thin: they validate parameters and render a
  screen from `apps/mobile/src/features/`. Never navigate after auth events; the `Stack.Protected`
  guards in `apps/mobile/src/app/_layout.tsx` do it.
- **Data**: server data only through TanStack Query hooks in
  `apps/mobile/src/features/<feature>/api.ts`, using `api` from `apps/mobile/src/api/client.ts` and
  `unwrapWith(..., Schema)`; never `fetch` directly (lint rule), never copy server data into
  Zustand or React state.
- **API contract first**: change `openapi/openapi.json`, run `pnpm contract`, commit both; never edit
  `apps/mobile/src/api/schema.d.ts` by hand.
- **UI**: components from `apps/mobile/src/ui` only (`Text`, `Button`, `TextField`, `Image`…), theme
  values only (no color literals), every control with an accessible role and label, 48 dp touch
  targets, loading/empty/error/offline states; messages that appear without navigation use
  `AlertText` (announced on both platforms); every new screen goes into
  `apps/mobile/src/a11y.spec.tsx`. Lint enforces the imports;
  [docs/accessibility.md](docs/accessibility.md) has the checklist.
- **Configuration**: read it from `apps/mobile/src/config/env.ts` only; a new variable goes in
  `apps/mobile/src/config/env.schema.ts`, its line in `apps/mobile/src/config/env.ts`,
  `apps/mobile/.env.example` and docs/releases.md#environment-variables. `EXPO_PUBLIC_*` values are
  public: never a secret.
- **Storage**: through `apps/mobile/src/lib/storage` only; credentials in `secureStorage`, nothing
  sensitive in `persistentStorage`, no AsyncStorage. New data the app keeps or sends gets its row in
  the data inventory (SECURITY.md#data-inventory) and, if it belongs to the user, is cleared at
  sign-out.
- **Offline**: online-only writes unless the five requirements of
  docs/mobile-architecture.md#offline are met; never add a generic sync engine.
- **Errors and logs**: `AppError` + `userMessage()` for users, `reportError()` and `logger` for
  developers; never `console.log`, never tokens, passwords or personal data in logs, analytics or
  error reports.
- **Links and notifications** are untrusted input: accepted paths go in
  `apps/mobile/src/lib/links.ts` with a test; a link never performs an action by itself.
- **Tests** next to the code: `*.spec.ts(x)` for unit and component tests, `*.int.spec.tsx` for
  screen-to-API integration; query by role and label; Maestro flows in
  `apps/mobile/.maestro/flows/` for critical journeys. Never weaken a test, a lint rule, a type or
  a threshold to make a check pass; fix the cause.
- **Git**: branches `<type>/<description>`, Conventional Commits, never push to `main`.
- **Never commit** `.env` files, keystores, certificates, service account keys, tokens or personal
  data. Never weaken a supply-chain or security setting to get past a failure
  (`minimumReleaseAge`, `trustPolicy`, `allowBuilds`, `scripts/dependency-policy.json`, workflow
  `permissions`, pins); a `nosemgrep` or `eslint-disable` needs its reason on the same line and a
  human reviewer.
- **Releases** (builds, store submissions, OTA updates) are started by people through the GitHub
  workflows, never by an agent.
- **Bilingual docs**: `docs/manual.md`/`docs/manual.es.md` and `docs/step-by-step.md`/
  `docs/step-by-step.es.md` exist in English and Spanish: a change to one (a command, a step, a
  variable) goes to the other in the same change.
