# Contributing

- [Setup](#setup)
- [From issue to main](#from-issue-to-main)
- [Branches](#branches)
- [Commits](#commits)
- [Git hooks](#git-hooks)
- [Pull requests and review](#pull-requests-and-review)
- [Adding a dependency](#adding-a-dependency)
- [Reporting security issues](#reporting-security-issues)

## Setup

Node.js 24 (`.nvmrc`), pnpm (`corepack enable`, after `npm install -g corepack` from Node.js 25; the
version is in the root `package.json`), and for native builds Android Studio (SDK, emulator, JDK 17) and, on
macOS, Xcode. Then follow the quick start in the [README](README.md#quick-start). `pnpm install`
also installs the Git hooks.

## From issue to main

1. **Issue.** Use the feature or bug template: acceptance criteria, screens and states, release
   impact.
2. **Branch** from an up-to-date `main` ([below](#branches)). Never commit to `main`.
3. **The API first** when the contract changes: the route and its schemas in `apps/api`, then
   `pnpm contract`, and commit both generated files ([openapi/README.md](openapi/README.md)); a
   database change comes with its migration ([docs/database.md](docs/database.md)).
4. **Code and tests together**, following [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) and
   [docs/testing.md](docs/testing.md).
   [docs/mobile-architecture.md](docs/mobile-architecture.md#adding-a-feature) has the steps for a
   new feature.
5. **Try it on devices**: Android and iOS, light and dark, a large font size, offline.
6. **Commit** with Conventional Commits ([below](#commits)).
7. **Verify**: `pnpm verify`; `pnpm test:e2e:mobile` when a critical flow changed.
8. **Push** and open a pull request with the template. Its title becomes the commit on `main`.
9. **Merge** (squash) once CI passes and a reviewer approved. Releases are a separate, deliberate
   step ([docs/releases.md](docs/releases.md)).

## Branches

`<type>/<short-description>`, for example `feat/item-sharing`, `fix/ABC-123-session-expiry`.
Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `hotfix`,
`release`. Checked by the pre-push hook and by CI (`scripts/check-branch-name.mjs`). Bots
(Dependabot, release-please) keep their own names.

Short-lived branches off `main`, merged back by pull request. No long-lived `develop` or release
branches: a release is a tag on `main`, and a fix for a released version ships from `main` (as an
OTA update when it is JavaScript only).

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, checked by the
commit-msg hook (`commitlint.config.mjs`) and on the pull request title by CI.

```
feat(items): share an item from its detail screen
fix(auth): keep the session when two requests get a 401 at once
perf(items): virtualize the search results
chore(deps): bump expo-image within SDK 57
feat(api)!: require the new item schema

BREAKING CHANGE: items without a title are rejected.
```

- The type decides the next version (release-please): `feat` → minor, `fix`/`perf` → patch, `!` or
  a `BREAKING CHANGE:` footer → major (minor while the version is 0.x). Others (`docs`,
  `refactor`, `test`, `ci`, `build`, `chore`, `style`) do not release by themselves.
- The summary is imperative, lowercase, without a final period; the body explains why.
- Pull requests are squash-merged: the title is what lands on `main`, so it must follow the rule;
  individual commits on a branch can be informal.

## Git hooks

Installed by `pnpm install` (Husky, `.husky/`):

| Hook         | Runs                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | on staged files only (`lint-staged.config.mjs`): refuses `.env` files, secretlint, ESLint with fixes, Prettier |
| `commit-msg` | commitlint                                                                                                     |
| `pre-push`   | refuses pushes to `main`/`master` and badly named branches, then `pnpm typecheck` and `pnpm test`              |

The hooks are a fast first line; CI runs every gate regardless. Do not bypass them with
`--no-verify`; the one exception is the very first push of a new repository
(`git push --no-verify -u origin main`).

## Pull requests and review

The pull request template asks for what and why, how it was tested (devices included), screenshots
for UI changes, the release impact (OTA update or store build) and the Definition of Done checklist.

Reviewers check, beyond correctness:

- the layer rules and that new code reads like the code around it;
- error, loading, empty and offline states; accessibility (roles, labels, sizes);
- security: no secret or personal data in logs or analytics, input validated, permissions in
  context;
- the release impact is right: a native change marked as such;
- tests that would fail if the change broke.

Code owners ([.github/CODEOWNERS](.github/CODEOWNERS)) must approve changes to sensitive paths:
auth, storage, observability, native configuration, release and CI files.

## Adding a dependency

1. Is it needed? The SDK, React Native or a few lines of code may do.
2. Prefer an Expo SDK module; otherwise a maintained library that supports the New Architecture
   ([React Native Directory](https://reactnative.directory)), with a config plugin if it has native
   code.
3. Install with `pnpm --filter mobile exec expo install <package>` (SDK-compatible version). A tool
   of the repository itself (a lint plugin, a script's library) goes to the root instead:
   `pnpm add -D -w <package>`. Each package declares what it imports: nothing reaches the app by
   hoisting.
4. If pnpm reports an ignored build script, decide in `pnpm-workspace.yaml` `allowBuilds` with the
   reason (default `false`). `true` also needs the reviewed exception, with its reason, in
   `scripts/dependency-policy.json`, or `pnpm deps:check` fails.
5. `pnpm expo:doctor`, `pnpm security` (license and source policy) and
   `pnpm build && pnpm perf:check` (bundle budget) must pass.
6. Explain the choice in the pull request; with native code, mark the release impact (store build).

## Reporting security issues

Never in a public issue: see [SECURITY.md](SECURITY.md).
