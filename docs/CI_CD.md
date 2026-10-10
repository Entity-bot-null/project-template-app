# CI/CD

The GitHub Actions workflows: what each one checks or ships, how they are protected, and how to set
up a new repository. What a release is (profiles, versions, updates, rollbacks) is in
[RELEASES.md](RELEASES.md).

- [Workflows](#workflows)
- [Required check](#required-check)
- [What protects production](#what-protects-production)
- [EAS builds](#eas-builds)
- [Environments](#environments)
- [Secrets and variables](#secrets-and-variables)
- [Setting up the repository](#setting-up-the-repository)
- [Workflow security](#workflow-security)
- [Pinning](#pinning)

## Workflows

| Workflow                    | Trigger                                        | Secrets                           | Does                                                                                            |
| --------------------------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ci.yml`                    | pull request, push to `main`, manual           | none                              | conventions (branch name, PR title), dependency review (opt-in), the quality gates, "CI passed" |
| `quality-gates.yml`         | called by CI, EAS build and EAS update         | none                              | the gates below, on a given commit                                                              |
| `e2e-android.yml`           | pull request and push touching the app, manual | none                              | release APK of the `e2e` variant, mock API, emulator, Maestro flows                             |
| `codeql.yml`                | pull request, push, weekly (opt-in)            | none                              | CodeQL security analysis (needs a public repo or GitHub Advanced Security)                      |
| `release.yml`               | push to `main`                                 | `RELEASE_PLEASE_TOKEN` (optional) | release pull request; on merge, tag, GitHub release and SBOM                                    |
| `main-guard.yml`            | push to `main`                                 | none                              | checks that each pushed commit is a merged pull request; otherwise fails and opens an issue     |
| `dependabot-auto-merge.yml` | approval of a Dependabot pull request          | none                              | merges a patch or minor update once **CI passed** (checks the approval and CI itself)           |
| `eas-build.yml`             | manual, from `main` only                       | `EXPO_TOKEN` (environment)        | gates, then an EAS build (and optional submission to internal testing)                          |
| `eas-update.yml`            | manual, from `main` only                       | `EXPO_TOKEN` (environment)        | gates, then an OTA update to a channel, staged; source maps to Sentry                           |
| `eas-rollback.yml`          | manual, from `main` only                       | `EXPO_TOKEN` (environment)        | republish an earlier update or roll back to the embedded bundle                                 |

The quality gates, the same checks `pnpm verify` runs locally, plus the Docker-based ones:

| Job                                   | Runs                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format, lint, types, workflows        | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (contract drift included), `pnpm test:scripts`, `node scripts/lint-workflows.mjs`                                                                                                 |
| Expo doctor                           | `pnpm expo:doctor`: SDK compatibility of dependencies (against the installed SDK's manifest, so the result depends on the lockfile, not on the day Expo publishes a patch), config, duplicate native modules, React Native Directory |
| Static analysis (Semgrep)             | `node scripts/sast.mjs`                                                                                                                                                                                                              |
| Unit, component and integration tests | `pnpm test:coverage` with thresholds; the HTML report as an artifact                                                                                                                                                                 |
| Security                              | `pnpm security` (audit, dependency policy, secrets in the tree) and gitleaks on the full history                                                                                                                                     |
| Bundle, budget and native projects    | `pnpm build:check` (production export + bundle budget), `expo prebuild` of both platforms                                                                                                                                            |

Pull requests from Dependabot run the same gates; they skip only the conventions job (bots name
branches their own way).

## Dependency updates

Dependabot opens the update pull requests every week (`.github/dependabot.yml`). Each one runs the
full CI. A maintainer reads it (the changelog links in its description) and **approves** it, and
**Dependabot auto-merge** (`dependabot-auto-merge.yml`) merges it with a squash. The workflow checks
every condition itself, so it works without branch protection:

- Dependabot opened the pull request, and every update in it is a patch, a minor version, or a new
  digest of the same image tag;
- it changes no workflow or action (`.github/workflows/`, `.github/actions/`): the workflow token
  may not merge those;
- the approval comes from a user with write access. A rebase by Dependabot keeps it (the same
  updates); a commit anyone else pushes, or Dependabot recreating the update with other versions,
  needs an approval of the latest commit. With `main.json` imported, GitHub itself dismisses an
  approval on any new commit, a rebase included: approve again after one;
- **CI passed** succeeded on the latest commit. When the approval comes first, the job waits for
  CI, up to 50 minutes; past that, re-run the job. A newer approval or a request for changes
  replaces the waiting job; a comment on the pull request does not.

It then starts CI on `main`, since a merge made with the workflow token triggers no workflow. A
major update, an update to the workflows, or a pull request the workflow declined (its run says
why) is merged by hand, after reading its release notes. On an update to the workflows, the job
stops before running any action: the workflow comes from the pull request, with its new pins. Expo
SDK packages move together through SDK upgrades; only their patch releases within the SDK's ranges
come through these pull requests, and `expo-doctor` in CI refuses anything the SDK does not
support.

## Required check

Branch protection requires one check, **CI passed**. It fails when any gate failed or was
cancelled, and passes when the others passed or were skipped because they are opt-in. Adding a gate
to `quality-gates.yml` makes it required with no settings change.

Rulesets and branch protection on private repositories need a paid GitHub plan. Without them the
rules still hold locally (the pre-push hook refuses pushes to `main`) and by convention, and two
workflows make up for part of it on any plan:

- **Main guard** (`main-guard.yml`) checks every push to `main`: each commit must be a merged pull
  request. A direct or forced push fails the workflow and opens an issue naming the commits and who
  pushed them. It detects; it cannot prevent.
- **Dependabot auto-merge** checks the approval and the CI result itself
  ([Dependency updates](#dependency-updates)), so it needs no branch protection.

Nothing replaces the required reviewers of the `production` environment: that needs a paid plan or
a public repository.

`E2E (Android)` is not part of it: emulator runs take longer and depend on the runner. Once the
project's flows are stable, add `Maestro flows on an emulator` to the ruleset's required checks.

## What protects production

No pull request can build, sign, submit or publish the app:

1. The workflows that talk to EAS run only on `workflow_dispatch`: no pull request, push or tag
   starts them.
2. They refuse to run from any branch but `main`, and ship only commits on `main`
   (`.github/actions/resolve-main`): only reviewed, merged code.
3. `EXPO_TOKEN` exists only as a secret of the `preview` and `production` GitHub environments,
   which accept deployments from `main` only. A workflow edited on a branch cannot reach it, even
   if its checks were removed.
4. The `production` environment requires a reviewer's approval for each run.
5. Every build and update runs the full gates on the exact commit first.
6. Production builds go to internal testing (Play internal track as a draft, TestFlight); the
   public release is a separate human action in each store.
7. The production EAS Update channel is protected (`eas channel:protect`): only account admins can
   publish to it, from any tool.
8. Signing keys and store credentials live on EAS, never in the repository or in GitHub.

## EAS builds

**EAS build** (`eas-build.yml`): Actions → EAS build → Run workflow (from `main`), with:

| Input      | Values                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| `profile`  | `preview` or `production`                                               |
| `platform` | `all`, `android`, `ios`                                                 |
| `ref`      | a branch, release tag or commit on `main` (production: the release tag) |
| `submit`   | production only: submit to Play internal (draft) and TestFlight         |

The job queues the build on EAS and ends (`--no-wait`): progress, logs and artifacts are on
expo.dev. Development and E2E builds are not built here: developers build `development` profiles
themselves, and the E2E workflow compiles its APK on the runner.

The gates are those of `main` when the workflow runs, checking the chosen commit: a release tag
older than a gate added since can fail it (a script the tag does not have). Ship the fix from
`main` with a new version rather than rebuilding such a tag.

**EAS update** (`eas-update.yml`) and **EAS rollback** (`eas-rollback.yml`): see
[RELEASES.md](RELEASES.md#ota-updates) and [RELEASES.md](RELEASES.md#rollback).

EAS also offers its own workflow engine (EAS Workflows, `.eas/workflows/`). The template keeps the
release steps in GitHub Actions so the same gates, reviews and audit trail apply to everything.

## Environments

Two GitHub environments, matching the EAS environments and channels (Settings → Environments).
For a **private** repository they need GitHub **Team** (organization) or **Pro** (personal), as do
rulesets (Team) and branch protection; on the Free plan they exist only for public repositories,
and without them the protections below do not hold.

| Environment  | Deployment branches | Required reviewers                                            | Secrets                                    |
| ------------ | ------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `preview`    | `main` only         | optional                                                      | `EXPO_TOKEN`; `SENTRY_AUTH_TOKEN` optional |
| `production` | `main` only         | yes (not the person who started the run; prevent self-review) | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`          |

## Secrets and variables

| Name                           | Kind                        | Where                                | For                                                                                                   |
| ------------------------------ | --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                   | secret                      | `preview`, `production` environments | EAS CLI: an Expo **robot user** token with the least role that can build and publish                  |
| `SENTRY_AUTH_TOKEN`            | secret                      | environments                         | source map upload of OTA updates; skipped, with a notice, where it or the variables below are missing |
| `RELEASE_PLEASE_TOKEN`         | secret (optional)           | repository                           | release pull requests that trigger CI (GitHub App or fine-grained token)                              |
| `SENTRY_ORG`, `SENTRY_PROJECT` | variable (optional)         | repository                           | with `SENTRY_AUTH_TOKEN`, enable the source map upload step                                           |
| `ENABLE_CODEQL`                | variable (optional, `true`) | repository                           | turn on CodeQL                                                                                        |
| `ENABLE_DEPENDENCY_REVIEW`     | variable (optional, `true`) | repository                           | turn on dependency review                                                                             |

Build-time values of the app itself (API URL, Sentry DSN) are EAS environment variables, not GitHub
ones ([RELEASES.md](RELEASES.md#environment-variables)).

## Setting up the repository

Once, after creating the repository from this template (REQUIERE CONFIGURACIÓN):

1. Rulesets: Settings → Rules → Rulesets → Import, `.github/rulesets/main.json` (pull requests,
   one approval, code owners, linear history, squash merges, "CI passed") and
   `.github/rulesets/tags.json` (release tags cannot be moved or deleted).
2. CODEOWNERS: replace the placeholders in `.github/CODEOWNERS` and uncomment.
3. Environments `preview` and `production` with their secrets ([above](#environments)).
4. Optional variables and secrets ([above](#secrets-and-variables)).
5. Settings → Actions → General: allow GitHub Actions to create pull requests (release-please), and
   keep workflow permissions read-only by default.
6. Settings → Code security: Dependabot alerts and security updates, secret scanning and push
   protection, private vulnerability reporting.
7. The first push of `main`: `git push --no-verify -u origin main` (the pre-push hook refuses pushes
   to `main` from then on).

## Workflow security

Every workflow follows the same rules, checked by `pnpm lint:workflows` (actionlint and zizmor, also
in CI):

- `permissions` read-only at the top; a job asks for more only when it writes something (the
  release job).
- `persist-credentials: false` on every checkout: no token left in `.git/config` for later steps.
- User-controlled values (PR titles, branch names, inputs) reach scripts through `env`, never
  `${{ }}` inside `run:` (script injection).
- No `pull_request_target`, no secrets in workflows that pull requests trigger.
- Third-party actions pinned by commit SHA ([below](#pinning)).
- zizmor's exceptions are listed, with their reason, in `.github/zizmor.yml`.
- shellcheck also checks the Git hooks in `.husky/`.

## Pinning

| What                                                | Pinned by                                              | Updated by                                            |
| --------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| GitHub Actions                                      | commit SHA (tag in a comment)                          | Dependabot (`github-actions`)                         |
| Tool images (actionlint, zizmor, Semgrep, gitleaks) | tag and digest in `.github/tool-images/Dockerfile`     | Dependabot (`docker`)                                 |
| npm dependencies                                    | `pnpm-lock.yaml`; seven-day release age                | Dependabot (`npm`), SDK packages through SDK upgrades |
| pnpm                                                | `packageManager` in `package.json`; `eas.json` `pnpm`  | by hand, both together                                |
| Node.js                                             | one exact version: `.nvmrc` (CI), `eas.json` `node`    | by hand, both together                                |
| EAS CLI                                             | exact version (`EAS_CLI_VERSION`) in the EAS workflows | by hand, at or above `eas.json` `cli.version`         |
| Maestro                                             | version and SHA-256 in `e2e-android.yml`               | by hand (release page), keeping the seven-day rule    |
| JDK (E2E build)                                     | `java-version: '17'` (React Native's supported JDK)    | by hand, with React Native's requirements             |
| Android NDK (E2E build)                             | `ndkVersion` of React Native's version catalog         | with React Native (read by `e2e-android.yml`)         |
| ccache (E2E build)                                  | Ubuntu's package (`apt-get`, signed archive)           | the runner image's Ubuntu release                     |
| Gradle's JVM memory (Android builds)                | `GRADLE_JVM_PROPERTIES` in `app.config.ts`             | by hand, when a build runs out of memory              |

**EAS CLI's dependencies.** The EAS workflows run `pnpm dlx "eas-cli@$EAS_CLI_VERSION"` from the
repository's root. The CLI's version is exact; its dependencies have no lockfile and resolve on
each run. The release delay and the trust policy of `pnpm-workspace.yaml` still apply to them:
since pnpm 11, `pnpm dlx` honors the project's `minimumReleaseAge*` and `trustPolicy*` settings
([pnpm dlx](https://pnpm.io/cli/dlx)). A dependency version younger than seven days, or published
with weaker evidence than the versions before it, is refused, and the dependencies' install
scripts do not run (pnpm lists them as ignored).

**Registries.** Docker Hub limits anonymous pulls per address, and CI runners share theirs, so a
busy day of pull requests fails jobs with `toomanyrequests`. Where an image is published elsewhere
with the same digest, the pin points there (GHCR, or Docker's mirror of its official images on
Amazon ECR Public). The images only Docker Hub hosts are pulled in CI through `mirror.gcr.io` by
their digest (`TOOL_IMAGE_MIRROR` in `quality-gates.yml`, read by `scripts/tool-image.mjs`):
the digest makes the content identical whatever the source, Docker Hub stays the fallback, and
Dependabot keeps updating the pins from their source.
