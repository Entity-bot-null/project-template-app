# 0002. Organize the repository as a pnpm workspace, one package per app

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

The template grows from one Expo app into three deliverables that change together: the app, the
API it talks to and a public landing (which also serves the universal-link files and the pages the
stores require), deployed behind one origin. The web template (`project-template-web` 2.0) already
has that shape: a pnpm workspace with `apps/api`, `apps/web` and `apps/landing`, one set of gates,
one version. Keeping the API, its contract and its client in one repository lets a pull request
change all three and prove them together.

Expo supports this layout without custom configuration: Metro is configured for monorepos by
`expo/metro-config` (SDK 52), isolated pnpm installs are supported (SDK 54) and autolinking
resolves the native modules of workspace dependencies (SDK 55).

## Options

1. **One repository per app:** each with its own gates, versions and releases; the contract drifts
   between them unless a fourth pipeline keeps them in step.
2. **One package at the root, the other apps in subfolders:** the app's Metro, Jest, TypeScript and
   expo-doctor would see the server's dependencies, and every dependency would belong to everyone.
3. **A pnpm workspace (`packages: [apps/*]`), one package per app, the repository's tooling at the
   root:** the web template's layout; each app declares and installs only what it imports.
4. **The same with a build orchestrator (Nx, Turborepo):** caching and task graphs this size does
   not need; `pnpm --filter` and `pnpm --recursive` cover it.

## Decision

Option 3, as in the web template:

- **Packages:** `apps/mobile` (`mobile`), then `apps/api` (`api`) and `apps/landing` (`landing`).
  Commands run from the root (`pnpm verify`, `pnpm android`…); one app's own script runs with
  `pnpm --filter <package> <script>`. The root `package.json` holds the repository's tooling
  (commitlint, ESLint and its plugins, Prettier, secretlint, Husky, lint-staged, TypeScript) and
  scripts; each app declares every package it imports (isolated installs, nothing by hoisting).
- **ESLint 9.39 for the whole repository**, with one `eslint.config.mjs` at the root and a block per
  app. The web template is on ESLint 10, but `eslint-config-expo` 57 brings `eslint-plugin-react`
  7.37 (peer `eslint ^9.7`) and `eslint-plugin-import` 2.32 (peer `eslint ^9`): neither accepts
  ESLint 10. Revisit when Expo's configuration supports it. `eslint-config-expo` is versioned with
  the Expo SDK, so `apps/mobile` declares it (expo-doctor and `expo install --fix` keep it in step
  with the SDK) and the root configuration loads it from there, scoped to `apps/mobile/**`. The
  repository's own scripts get ESLint's and the import plugin's recommended rules, plus the core
  rules Expo's configuration applied to them before the move.
- **One version for the whole repository:** release-please bumps the root `package.json` and, as
  extra files, each app's `package.json` (and `openapi/openapi.json` `info.version` once the API
  generates it). `apps/mobile/app.config.ts` keeps reading its own `package.json`. The next release
  is 0.2.0 (`bump-minor-pre-major`).
- **EAS runs from `apps/mobile`**, where `eas.json` and the app config are; it uploads the workspace.
- **Docs are named in lowercase with hyphens** (`docs/mobile-architecture.md`), like the web
  template's; the root files GitHub and the tools look for keep their names (`README.md`,
  `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`…).
- **The public image is named `web`**, although it is built from `apps/landing`: the server
  deployment, its workflows and the smoke test stay identical to the web template's, so a fix moves
  from one template to the other unchanged.
- **Local ports are the web template's plus 10**, so both templates run on one machine at once
  (Docker Compose project `template-app`):

  | Service                     | Web template   | This template  |
  | --------------------------- | -------------- | -------------- |
  | PostgreSQL                  | 5442           | 5452           |
  | Redis                       | 6389           | 6399           |
  | Mailpit SMTP / UI           | 1035 / 8035    | 1045 / 8045    |
  | API (`pnpm dev`)            | 3000           | 3010           |
  | Full stack (`web` image)    | 8080           | 8090           |
  | OTLP / Grafana / Prometheus | 4318/3001/9090 | 4328/3011/9100 |
  | Mock API (`pnpm mock:api`)  | none           | 4010           |

- **CI as in the web template:** runners pinned to `ubuntu-24.04` (a moved `ubuntu-latest` changes
  every job at once); the tool images in `scripts/tool-images/Dockerfile`, outside `.github/`, where
  Dependabot may change files for GitHub Actions only (dependabot/dependabot-core#15237); Dependabot
  ignores Ubuntu major and minor versions (an interim release such as 24.10 loses its archive after
  nine months); Node.js pinned exactly in `.nvmrc` (24.21.0), the version EAS builds with.

## Consequences

- One pull request changes the contract, the API and the app together, through one set of gates;
  the API and the landing are ported from the web template file by file instead of rewritten.
- Paths are longer (`apps/mobile/src/...`), and the app's tools run from the root or with
  `--filter`; EAS commands need a terminal in `apps/mobile`.
- Expo in a workspace must keep one copy of React and React Native (`pnpm why react react-native`;
  expo-doctor checks the native modules). If a native build ever fails because of isolated installs,
  the documented way out is `nodeLinker: hoisted`, only with a new ADR once the cause is understood:
  it gives up the guarantee that every import is declared.
- The decision is wrong if expo-doctor reports duplicated native modules, Metro or Gradle cannot
  resolve workspace packages, or EAS builds of `apps/mobile` fail where the root package built.
