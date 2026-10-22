# CI/CD

The GitHub Actions workflows: what each one checks or ships, how they are protected, and how to set
up a new repository. What a release of the app is (profiles, versions, updates, rollbacks) is in
[releases.md](releases.md); a deployment of the server side (the API and the web image) is
[Deployment](#deployment), on the server of [deploy-vps.md](deploy-vps.md).

- [Workflows](#workflows)
- [Dependency updates](#dependency-updates)
- [Required check](#required-check)
- [Release pull requests](#release-pull-requests)
- [What protects production](#what-protects-production)
- [EAS builds](#eas-builds)
- [Environments](#environments)
- [Secrets and variables](#secrets-and-variables)
- [Setting up the repository](#setting-up-the-repository)
- [Images](#images)
- [Workflow security](#workflow-security)
- [Infrastructure as code](#infrastructure-as-code)
- [Deployment](#deployment)
- [Pinning](#pinning)
- [Keeping the stack current](#keeping-the-stack-current)

## Workflows

| Workflow                    | Trigger                                                   | Secrets                           | Does                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                    | pull request, push to `main`, manual                      | none                              | dependency review (opt-in), the quality gates, "CI passed"                                                                                                   |
| `conventions.yml`           | pull request, again when its title is edited              | none                              | branch name and PR title (Conventional Commits); its check **Conventions** is required                                                                       |
| `quality-gates.yml`         | called by CI, EAS build, EAS update and Deploy            | none                              | the gates below, on a given commit                                                                                                                           |
| `docker-images.yml`         | called by the quality gates                               | none                              | builds the images (`api`, `api-migrate`, `web`) and scans them with Trivy; never pushes                                                                      |
| `e2e-android.yml`           | pull request and push touching the app or the API, manual | none                              | release APK of the `e2e` variant, emulator, Maestro flows against the mock API, then against the API with Mailpit                                            |
| `codeql.yml`                | pull request, push, weekly (opt-in)                       | none                              | CodeQL security analysis (needs a public repo or GitHub Advanced Security)                                                                                   |
| `release.yml`               | push to `main`                                            | `RELEASE_PLEASE_TOKEN` (optional) | release pull request and CI on it; on merge, tag, GitHub release and SBOM                                                                                    |
| `main-guard.yml`            | push to `main`                                            | none                              | checks that each pushed commit is a merged pull request; otherwise fails and opens an issue                                                                  |
| `dependabot-auto-merge.yml` | approval of a Dependabot pull request                     | none                              | merges a patch or minor update once **CI passed** (checks the approval and CI itself)                                                                        |
| `eas-build.yml`             | manual, from `main` only                                  | `EXPO_TOKEN` (environment)        | gates, then an EAS build (and optional submission to internal testing)                                                                                       |
| `eas-update.yml`            | manual, from `main` only                                  | `EXPO_TOKEN` (environment)        | gates, then an OTA update to a channel, staged; source maps to Sentry                                                                                        |
| `eas-rollback.yml`          | manual, from `main` only                                  | `EXPO_TOKEN` (environment)        | republish an earlier update or roll back to the embedded bundle                                                                                              |
| `deploy.yml`                | manual, from `main` only                                  | `DEPLOY_*` (environment)          | gates, then the server side to `staging` or `production`: images published and scanned, migration, rollout, smoke test, rollback ([Deployment](#deployment)) |
| `dast.yml`                  | weekly, manual                                            | none                              | OWASP ZAP on the production images started on the runner, or a passive scan of staging; ADVISORY ([security.md](security.md#dynamic-analysis))               |

The quality gates: the checks `pnpm verify` runs locally, plus the Docker-based ones, the
repository scripts' tests (`pnpm test:scripts`), the API's integration suite and images, the
infrastructure and observability code, and the native projects (`expo prebuild`):

| Job                                   | Runs                                                                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool images                           | resolves the pinned PostgreSQL, Redis and Mailpit images of `scripts/tool-images/Dockerfile` (through the mirror when it has them) for the integration job's service containers                                                                                             |
| Format, lint, types, workflows        | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (contract drift included), `pnpm test:scripts` (the migrations' contract steps and the mock API against the contract included), `node scripts/lint-workflows.mjs`                                                        |
| Expo doctor                           | `pnpm expo:doctor`: SDK compatibility of dependencies (against the installed SDK's manifest, so the result depends on the lockfile, not on the day Expo publishes a patch), config, duplicate native modules, React Native Directory                                        |
| Infrastructure as code (Terraform)    | `node scripts/check-iac.mjs` ([Infrastructure as code](#infrastructure-as-code))                                                                                                                                                                                            |
| Static analysis (Semgrep)             | `node scripts/sast.mjs`                                                                                                                                                                                                                                                     |
| Observability as code                 | `pnpm observability:check`: the dashboards and alert rules against the metric catalog and the runbooks, then promtool on the configuration, the rules, every dashboard query and the rules' unit tests ([observability.md](observability.md#dashboards-and-alerts-as-code)) |
| Unit, component and integration tests | `pnpm test:coverage` with the thresholds of every package (the API's OpenAPI drift spec included); the HTML reports as an artifact                                                                                                                                          |
| Integration tests                     | `pnpm test:integration`: the API over HTTP on PostgreSQL 18, with Redis 8 and Mailpit, all service containers; a missing one fails the suite instead of skipping it                                                                                                         |
| Security                              | `pnpm security` (audit, dependency policy, secrets in the tree) and gitleaks on the full history                                                                                                                                                                            |
| Build, budget and native projects     | `pnpm build` (the API, the landing, and the app's production export), `pnpm perf:check` (the landing's and the app's budgets), `expo prebuild` of both platforms in `apps/mobile`                                                                                           |
| End-to-end tests (browser)            | `pnpm test:e2e`: Playwright against the built landing and the web image built from its Dockerfile (base images through the mirror); the report and traces as an artifact on failure ([testing.md](testing.md#browser-end-to-end))                                           |
| Images                                | `docker-images.yml`: `apps/api/Dockerfile` (targets `runtime` and `migrate`) and `apps/landing/Dockerfile` built and scanned by Trivy (fixable HIGH and CRITICAL fail); nothing is pushed                                                                                   |

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

Branch protection requires two checks, **CI passed** and **Conventions**. **CI passed** fails when
any gate failed or was cancelled, and passes when the others passed or were skipped because they
are opt-in; adding a gate to `quality-gates.yml` makes it required with no settings change.
**Conventions** (`conventions.yml`) checks the branch name and the title, and runs again whenever
the title is edited, without re-running the gates: the title becomes the squash commit that
release-please reads.

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
project's flows are stable it can be: first remove the `paths` filters of `e2e-android.yml` (a
workflow its filters skip reports nothing, and a required check that never reports blocks the pull
request for good), then add `Maestro flows on an emulator` to the ruleset's required checks.

## Release pull requests

release-please opens and updates the release pull request with the workflow's token. GitHub holds
the pull request runs that token causes until someone with write access approves them, and the
ruleset requires **CI passed** and **Conventions** on every pull request. The release workflow
therefore starts both on the release branch itself (`gh workflow run ci.yml` and
`gh workflow run conventions.yml`, events that token can trigger): their checks land on the
branch's latest commit, the one the ruleset checks, and the dispatched **Conventions** reads the
title of the branch's open pull request. Nothing to configure. The
pull request's other workflows (`E2E (Android)`, CodeQL) keep waiting for an approval no rule
requires; a project that makes one of them a required check starts it in the same job
(`release-pr-ci` in `release.yml`). A change that adds nothing to the changelog (`chore`, `docs`,
`ci`…) leaves the release pull request as it was, behind `main`: **Update branch** on it brings it
up to date, and CI runs as for anyone's push.

`RELEASE_PLEASE_TOKEN` is optional: a GitHub App token or a fine-grained token (contents, pull
requests and issues: read and write) opens the release pull request as that identity instead. Every
pull request workflow then runs on it as on a person's, and the release workflow starts nothing
itself.

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
7. Where the Expo account has protected channels (a private beta of the Enterprise plan, per
   Expo's documentation on account roles), the production EAS Update channel is protected
   (`eas channel:protect`): only a Release Manager or above publishes to it, from any tool, so
   the `production` environment's `EXPO_TOKEN` belongs to a Release Manager. Without protected
   channels, any token that can publish reaches production: the environment's reviewer is the
   gate.
8. Signing keys and store credentials live on EAS, never in the repository or in GitHub.

The server side follows the same rules: `deploy.yml` runs only on `workflow_dispatch`, from `main`,
for a commit on `main`, re-runs every gate on it, and reaches the server only from the `staging`
and `production` environments, whose `DEPLOY_SSH_KEY` no other workflow can read. The database,
Redis and JWT secrets never leave the server ([deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)).

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
[releases.md](releases.md#ota-updates) and [releases.md](releases.md#rollback).

EAS also offers its own workflow engine (EAS Workflows, `.eas/workflows/`). The template keeps the
release steps in GitHub Actions so the same gates, reviews and audit trail apply to everything.

## Environments

Three GitHub environments (Settings → Environments): `preview` and `production` match the EAS
environments and channels of the app, `staging` and `production` the servers of the API and the
web image (the `preview` builds talk to the staging server, the `production` builds to the
production one). For a **private** repository they need GitHub **Team** (organization) or **Pro**
(personal), as do rulesets (Team) and branch protection; on the Free plan they exist only for
public repositories, and without them the protections below do not hold.

| Environment  | Deployment branches | Required reviewers                                            | Secrets                                                                   |
| ------------ | ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `preview`    | `main` only         | optional                                                      | `EXPO_TOKEN`; `SENTRY_AUTH_TOKEN` optional                                |
| `staging`    | `main` only         | optional                                                      | `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (with the server target)           |
| `production` | `main` only         | yes (not the person who started the run; prevent self-review) | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`; `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |

## Secrets and variables

| Name                           | Kind                        | Where                                | For                                                                                                   |
| ------------------------------ | --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                   | secret                      | `preview`, `production` environments | EAS CLI: an Expo **robot user** token with the least role that can build and publish                  |
| `SENTRY_AUTH_TOKEN`            | secret                      | environments                         | source map upload of OTA updates; skipped, with a notice, where it or the variables below are missing |
| `RELEASE_PLEASE_TOKEN`         | secret (optional)           | repository                           | release pull requests that run every pull request workflow ([above](#release-pull-requests))          |
| `SENTRY_ORG`, `SENTRY_PROJECT` | variable (optional)         | repository                           | with `SENTRY_AUTH_TOKEN`, enable the source map upload step                                           |
| `ENABLE_CODEQL`                | variable (optional, `true`) | repository                           | turn on CodeQL                                                                                        |
| `ENABLE_DEPENDENCY_REVIEW`     | variable (optional, `true`) | repository                           | turn on dependency review                                                                             |
| `DEPLOY_TARGET`                | variable (`vps`)            | repository                           | the server target of `deploy.yml`; unset, its generic `release` job fails until implemented           |
| `IMAGE_PREFIX`                 | variable                    | repository                           | `ghcr.io/<owner>/<repository>`, lowercase: where Deploy pushes the images                             |
| `DEPLOY_HOST`, `PUBLIC_URL`    | variable                    | `staging`, `production`              | the server's host name and the public origin the smoke test checks                                    |
| `DEPLOY_USER`, `DEPLOY_PATH`   | variable (optional)         | `staging`, `production`              | default `deploy` and `/srv/app`                                                                       |
| `DEPLOY_SSH_KEY`               | secret                      | `staging`, `production`              | the deploy user's private key ([deploy-vps.md](deploy-vps.md#4-the-deploy-user-and-its-ssh-key))      |
| `DEPLOY_KNOWN_HOSTS`           | secret                      | `staging`, `production`              | the server's host key, checked on every connection                                                    |
| `DAST_STAGING_URL`             | variable (optional)         | repository                           | the staging origin for DAST's passive scan                                                            |

Build-time values of the app itself (API URL, Sentry DSN) are EAS environment variables, not GitHub
ones ([releases.md](releases.md#environment-variables)).

## Setting up the repository

Once, after creating the repository from this template (REQUIERE CONFIGURACIÓN):

1. Rulesets: Settings → Rules → Rulesets → Import, `.github/rulesets/main.json` (pull requests,
   one approval, code owners, linear history, squash merges, "CI passed" and "Conventions") and
   `.github/rulesets/tags.json` (release tags cannot be moved or deleted). The approval must come
   from someone other than the last person who pushed: a team of one sets
   `required_approving_review_count` to `0` and `require_code_owner_review` and
   `require_last_push_approval` to `false` before importing `main.json`.
2. CODEOWNERS: replace the placeholders in `.github/CODEOWNERS` and uncomment.
3. Environments `preview`, `staging` and `production` with their secrets ([above](#environments));
   the server's part, with the server itself: [deploy-vps.md](deploy-vps.md#7-github-settings).
4. Optional variables and secrets ([above](#secrets-and-variables)).
5. Settings → Actions → General: allow GitHub Actions to create pull requests (release-please), and
   keep workflow permissions read-only by default.
6. Settings → Code security: Dependabot alerts and security updates, secret scanning and push
   protection, private vulnerability reporting.
7. The first push of `main`: `git push --no-verify -u origin main` (the pre-push hook refuses pushes
   to `main` from then on).

## Images

`docker-images.yml` builds `api`, `api-migrate` (the `migrate` stage of `apps/api/Dockerfile`:
the Prisma CLI with its schema engine and the committed migrations) and `web` (`apps/landing/Dockerfile`:
the landing, the app's links and their files, behind nginx), tagged with the commit SHA and
built with `APP_RELEASE=<commit SHA>`, the release every log line, error report and span of the
image carries ([observability.md](observability.md#identity)), cached in the GitHub Actions cache,
and scans each one with Trivy before any push: a fixable HIGH or CRITICAL advisory fails the job
([security.md](security.md#container-images)). The builds pass the day as `OS_UPGRADE_DATE`: the
operating system upgrade in the Dockerfile runs again once a day instead of coming from the cache
until the base image changes. The base images come through the mirror by digest where it has them
(`scripts/tool-image.mjs --build-contexts`). CI never pushes. To publish, set `IMAGE_PREFIX` (for
example `ghcr.io/owner/repo`), add the registry login step marked in the file (and
`packages: write` for GHCR), and call it with `push: true`; the Deploy workflow's `publish` job
does exactly that for the server target ([Deployment](#deployment)). Pushed images carry their SBOM and SLSA
provenance as attestations; signed GitHub attestations are one commented step away
([security.md](security.md#artifact-integrity)).

Locally: `docker compose --profile stack up --build` builds the same Dockerfiles, runs the
migrations and serves everything on `http://localhost:8090` (the API at `/api`), on the compose
Redis; `pnpm smoke --url http://localhost:8090` checks it (`--release <APP_RELEASE>` too, when the
root `.env` sets one)
([manual.md](manual.md#55-the-production-like-stack)). Add `--profile observability` (and
`STACK_OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318` in the root `.env`) to see its traces and
metrics in Grafana.

The build context is an allowlist (`.dockerignore`): the root manifests, the lockfile and `apps/`,
minus the mobile app's generated native projects. A new top-level folder an image needs (a shared
`packages/`) must be added there.

## Workflow security

Every workflow follows the same rules, checked by `pnpm lint:workflows` (actionlint and zizmor, also
in CI):

- `permissions` read-only at the top; a job asks for more only when it writes something (the
  release jobs).
- No dependency code runs next to a write token: the release's SBOM is generated in a read-only
  job and attached by another that installs nothing.
- `persist-credentials: false` on every checkout: no token left in `.git/config` for later steps.
- User-controlled values (PR titles, branch names, inputs) reach scripts through `env`, never
  `${{ }}` inside `run:` (script injection).
- No `pull_request_target`, no secrets in workflows that pull requests trigger.
- Third-party actions pinned by commit SHA ([below](#pinning)).
- zizmor's exceptions are listed, with their reason, in `.github/zizmor.yml`.
- shellcheck also checks the Git hooks in `.husky/`.

## Infrastructure as code

`infra/terraform/digitalocean` provisions the server target on DigitalOcean
([deploy-vps.md](deploy-vps.md#provision-with-terraform-digitalocean)), and `deploy/vps/db-init.sh`
creates the database and its roles on a server that runs its own
([deploy-vps.md](deploy-vps.md#5-the-database)). The CI job **Infrastructure as code (Terraform)**,
and `pnpm iac:check` locally, check both with the pinned images, the configuration mounted
read-only, without a cloud account or a token:

| Check                                                                                 | Fails on                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `terraform fmt -check -recursive`                                                     | a file Terraform would reformat                                                         |
| `terraform init -backend=false -lockfile=readonly`, `terraform validate`              | a provider whose checksum is not in `.terraform.lock.hcl`; an invalid configuration     |
| `terraform test` (`tests/*.tftest.hcl`, the DigitalOcean provider mocked)             | the server, firewalls, database or alerts drifting from the guide; a bad input accepted |
| TFLint, every bundled Terraform rule (`infra/terraform/.tflint.hcl`)                  | any finding, notices included                                                           |
| Trivy's misconfiguration checks (those bundled with the pinned image)                 | HIGH or CRITICAL, unless an inline `trivy:ignore` gives its reason                      |
| `cloud-init schema` on the rendered user data, with Ubuntu 24.04's cloud-init         | an invalid key or value                                                                 |
| shellcheck on the user data's `runcmd`, the fingerprint of `files/docker.asc`         | a shell finding; a key other than Docker's                                              |
| `database/roles.sql` on PostgreSQL as an administrator that is not a superuser, twice | an error; roles or rights other than the guide's                                        |
| `deploy/vps/db-init.sh` in PostgreSQL's entrypoint on an empty volume, as mounted     | an error; roles or rights other than the guide's; a weak or wrong password let in       |
| A backup as `app_backup` (`pg_dump`, the format of the server's nightly backup)       | a dump without the data                                                                 |

A real `terraform plan` or `apply` is never part of CI: it needs an account, a token and the
state. Run them by hand, per environment. The Terraform and TFLint images are updated by
Dependabot like every tool image, and the providers by its `terraform` entry (version and
checksums together); a Terraform minor release also needs `required_version` in `versions.tf`,
which the gate enforces.

## Deployment

`deploy.yml` is the integration point. Run it from `main` (it refuses any other branch) with the
environment and the ref to deploy: a branch, a release tag or a commit SHA. The ref is resolved
once to a commit, which must be on `main` (reviewed and merged code only); the gates and the
release then use that SHA, never the ref, which could move in between.

Two release paths follow the gates:

- **The reference target, one Linux server with Docker** (repository variable
  `DEPLOY_TARGET=vps`, [deploy-vps.md](deploy-vps.md), [ADR 0009](adr/0009-postgresql-and-redis-on-the-server.md)), implemented: `publish` pushes the three
  images to ghcr.io once per commit, scans the digests it pushed and records them in the run
  (production reuses the digests staging recorded, and scans them again), and `release-vps`, in the
  GitHub environment,
  checks that the server's copy of `deploy/vps` matches the release, runs `deploy.sh` on the
  server over SSH with the recorded digests (pull by digest, migrate, roll out, back to the running
  release when the rollout fails), runs the smoke test and calls `rollback.sh` when it fails.
- **Any other platform:** the `release` job fails on purpose until it is implemented for it
  (REQUIERE CONFIGURACIÓN), in the order below.

The pipeline from a merged commit to production, and who does each step:

| Step                          | VPS target (`DEPLOY_TARGET=vps`)                                   | Any other platform (REQUIERE CONFIGURACIÓN)         |
| ----------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| 1. Build                      | Gates (`pnpm build`, the three images)                             | the same                                            |
| 2. Test                       | Gates (unit, component, integration, E2E, coverage)                | the same                                            |
| 3. Security gates             | Gates (audit, dependency policy, secrets, SAST, Trivy)             | the same                                            |
| 4. Publish the images         | `publish`: ghcr.io, once per commit, scanned and recorded          | `docker-images.yml` with `push: true`               |
| 5. Deploy by immutable digest | `release-vps` hands the recorded `<image>@<digest>` to `deploy.sh` | the release job                                     |
| 6. Migrate (expand/contract)  | `deploy.sh` runs the `api-migrate` image                           | the release job runs the `api-migrate` image        |
| 7. Deploy the API             | `deploy.sh`, waiting for readiness                                 | the release job                                     |
| 8. Deploy the web image       | `deploy.sh`                                                        | the release job                                     |
| 9. Smoke test                 | `scripts/smoke-test.mjs` in `release-vps`                          | `scripts/smoke-test.mjs` in the release job         |
| 10. Rollback on failure       | `deploy.sh` on a failed rollout, `rollback.sh` on a failed smoke   | the release job, or by hand ([Rollback](#rollback)) |

Steps 1 to 3 run on the exact commit being deployed (the `gates` job of `deploy.yml`). For any
other platform, implement the release job in this order (the VPS target follows it too):

1. **Images, once per commit.** Push them (`docker-images.yml` with `push: true`, tags
   `<IMAGE_PREFIX>/<image>:<sha>`), take each digest from the build's output, scan that digest and
   record it. Production must run the digests staging verified, not a rebuild (a rebuild picks up
   newer base image patches and is a different artifact): reuse the digests staging recorded. Never
   look a digest up from the tag: any workflow of the repository with `packages: write`, on any
   branch, can push `<image>:<sha>`, and a lookup after the approval wait would ship whatever it
   points to then. The VPS jobs do this with an artifact per image, trusted only from a run of
   `deploy.yml` from a commit on `main` (`scripts/recorded-images.mjs`). Deploy `<image>@<digest>`
   from here on; verify its attestation first where signed attestations are enabled
   (docs/security.md#artifact-integrity).
2. **Record the digests running now**, before changing anything: they are the rollback target.
3. **Migrate:** run the `api-migrate` image against the environment's database
   (`prisma migrate deploy`). If it fails, stop here: the running version keeps serving
   (docs/incident-response.md#10-failed-database-migration).
4. **Roll out `api`, then `web`**, letting the platform wait for readiness
   (`GET /api/health/ready` on the API itself; the web server does not expose it).
5. **Smoke test:**
   `node scripts/smoke-test.mjs --url <public URL> --api <API URL inside the platform> --release <sha>`
   checks the public side (web server, `/release.json` naming the expected release, the landing
   in both languages with its links and share picture on the deployment's origin and its security
   headers, the not-found page, the open-in-app page at the app's links, the app's link files, the
   API through the proxy, probes not public) and the API's liveness and readiness. Read-only: it
   signs nobody in. Once the app's identity is set, add `--require-app-links`.
6. **On failure, roll back** to the digests recorded in step 2.

Staging first: deploy to `staging`, verify (the DAST baseline can run against it), then deploy the
same commit to `production`. Before the first production release, go through
[production-readiness.md](production-readiness.md).

### Compatibility between versions

During a rollout the old and the new API run side by side against the same database, and a
rollback runs the old version against the new schema. So every release must be:

- **backward compatible with the schema before it:** the new code works before its migration's
  contract step (it only adds, docs/database.md#expand-and-contract);
- **forward compatible with the schema after it:** the previous code keeps working on the migrated
  schema (it ignores new tables and nullable columns; nothing it reads was removed or renamed);
- **compatible on the wire with every app version still installed**, not only the previous
  release: an app is updated by its users, on their schedule, so new response fields are additive,
  new request fields optional, and a removal waits until no supported version uses it (the
  minimum supported version, [releases.md](releases.md#minimum-supported-version)); the contract
  diff shows each change in review ([api-conventions.md](api-conventions.md)). An OTA update can
  reach the installs of a runtime version in a day; a store release takes weeks to reach most of
  them.

A change that cannot meet these (a rename, a type change, a new required field) is split across
releases: expand, migrate the readers and writers, contract. Nothing at run time tells a contract
step that came too early (readiness and the smoke test read no table), so the migration that
contracts says why it is safe, `-- contract: <reason>` above the statement, and
`scripts/check-migrations.mjs` refuses one without it (docs/database.md#expand-and-contract).

### Rollback

| What failed                                   | Rollback                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The application (errors, latency, a bug)      | Redeploy the previous digests of `api` and `web` (step 2). The platform's own "previous revision" does the same when it points at those digests. No migration is reversed: the previous version runs on the new schema.                                     |
| An image (it does not start, fails readiness) | The same: the previous digests. Never rebuild an old commit for a rollback: it would be a new, unverified artifact.                                                                                                                                         |
| The migration                                 | Nothing to roll back in the application: the rollout had not started. Repair the database and resolve the migration (docs/incident-response.md#10-failed-database-migration); if a destructive statement removed data, restore (docs/disaster-recovery.md). |
| A release whose contract step already ran     | The previous version may need what was removed: roll forward with a fix instead, or restore. That is why contract steps ship one release after the code stopped using what they remove.                                                                     |

Running **Deploy** with an earlier release tag also rolls back, through every gate on that old
commit: slower, it rebuilds the images unless an earlier run recorded them (the VPS target keeps
its records 90 days; an image still in the registry is not enough, by design), and a gate can fail
on an advisory published since that release. Keep it for planned rollbacks; in an incident,
redeploy the recorded digests. Never roll back by reversing a migration in production.

## Pinning

| What                                                                                                                             | Pinned by                                                          | Updated by                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| GitHub Actions                                                                                                                   | commit SHA (tag in a comment)                                      | Dependabot (`github-actions`)                                                               |
| Runner image                                                                                                                     | `runs-on: ubuntu-24.04` in every workflow                          | by hand, the next LTS ([Ubuntu](#ubuntu))                                                   |
| Tool images (actionlint, zizmor, Semgrep, gitleaks, Terraform, TFLint, Ubuntu, Trivy, PostgreSQL, Redis, Mailpit, ZAP, promtool) | tag and digest in `scripts/tool-images/Dockerfile`                 | Dependabot (`docker`); PostgreSQL and Redis majors by hand ([below](#postgresql-and-redis)) |
| The API's base image (Node.js)                                                                                                   | tag and digest in `apps/api/Dockerfile`                            | Dependabot (`docker`); the Node.js major by hand                                            |
| Development services (PostgreSQL, Redis, Mailpit)                                                                                | tag and digest in `docker-compose.yml`, the same as CI's           | Dependabot (`docker-compose`); majors by hand                                               |
| The server's images (Caddy, PostgreSQL, Redis)                                                                                   | tag and digest in `deploy/vps/compose.yaml`                        | Dependabot (`docker-compose`); majors by hand                                               |
| Terraform providers (`infra/terraform`)                                                                                          | exact version in `versions.tf`, checksums in `.terraform.lock.hcl` | Dependabot (`terraform`), version and checksums together                                    |
| npm dependencies                                                                                                                 | `pnpm-lock.yaml`; seven-day release age                            | Dependabot (`npm`), SDK packages through SDK upgrades                                       |
| pnpm                                                                                                                             | `packageManager` in `package.json`; `apps/mobile/eas.json` `pnpm`  | by hand, both together                                                                      |
| Node.js                                                                                                                          | one exact version: `.nvmrc` (CI), `apps/mobile/eas.json` `node`    | by hand, both together                                                                      |
| EAS CLI                                                                                                                          | exact version (`EAS_CLI_VERSION`) in the EAS workflows             | by hand, at or above `apps/mobile/eas.json` `cli.version`                                   |
| Maestro                                                                                                                          | version and SHA-256 in `e2e-android.yml`                           | by hand (release page), keeping the seven-day rule                                          |
| JDK (E2E build)                                                                                                                  | `java-version: '17'` (React Native's supported JDK)                | by hand, with React Native's requirements                                                   |
| Android NDK (E2E build)                                                                                                          | `ndkVersion` of React Native's version catalog                     | with React Native (read by `e2e-android.yml`)                                               |
| Android emulator (E2E)                                                                                                           | `api-level` in `e2e-android.yml`                                   | by hand, to the `targetSdk` of React Native's catalog                                       |
| ccache (E2E build)                                                                                                               | Ubuntu's package (`apt-get`, signed archive)                       | the runner image's Ubuntu release                                                           |
| Gradle's JVM memory (Android builds)                                                                                             | `GRADLE_JVM_PROPERTIES` in `apps/mobile/app.config.ts`             | by hand, when a build runs out of memory                                                    |

**EAS CLI's dependencies.** The EAS workflows run `pnpm dlx "eas-cli@$EAS_CLI_VERSION"` in
`apps/mobile`, inside the workspace, so the root's `pnpm-workspace.yaml` applies. The CLI's version is exact; its dependencies have no lockfile and resolve on
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
Dependabot keeps updating the pins from their source. GHCR and ECR Public limit anonymous pulls
too, so before a script runs a tool image it pulls it and, when a registry answers with its rate
limit, retries after 5, 10 and 20 seconds (`ensureImage`).

## Keeping the stack current

Dependabot's pull requests are the weekly routine ([Dependency updates](#dependency-updates)). What
it never proposes is moved by a person, on its own branch, with the full CI and E2E (Android) on
its pull request:

| Part                                       | Dependabot proposes                                                   | Moved by hand                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| npm packages outside the SDK               | minors and patches (grouped), majors (one per pull request)           | merging a major after its release notes; ESLint 10 waits for `eslint-config-expo`        |
| Expo SDK, React Native, the SDK's packages | patches within the SDK's ranges (`expo-sdk` group)                    | the SDK upgrade, about three times a year ([releases.md](releases.md#expo-sdk-upgrades)) |
| Jest, `@types/jest`                        | patches                                                               | the major `jest-expo` depends on, in an SDK upgrade                                      |
| TypeScript                                 | patches                                                               | [minors and majors](#typescript)                                                         |
| Node.js, `@types/node`                     | `@types/node` minors and patches                                      | [Node.js](#nodejs)                                                                       |
| pnpm                                       | nothing (it never edits `packageManager`)                             | [pnpm](#pnpm)                                                                            |
| GitHub Actions                             | new SHA and version comment, in the workflows and `.github/actions/*` | merging: the auto-merge never merges a change to a workflow or an action                 |
| Tool images                                | tag and digest together                                               | PostgreSQL and Redis majors ([PostgreSQL and Redis](#postgresql-and-redis))              |
| The API's images and `docker-compose.yml`  | tag and digest together, Node.js minors                               | the Node.js major ([Node.js](#nodejs)); PostgreSQL and Redis majors                      |
| EAS CLI, Maestro, JDK, emulator            | nothing                                                               | the versions in the workflows ([Pinning](#pinning)), every quarter                       |
| Terraform providers, Terraform             | the providers' version and checksums together (`terraform`)           | Terraform's own minor: `required_version` in `versions.tf`, with the tool image          |
| Ubuntu (the runners)                       | nothing                                                               | [Ubuntu](#ubuntu)                                                                        |

### Ubuntu

CI's runners and the servers run the same Ubuntu LTS, 24.04: `runs-on: ubuntu-24.04` in every
workflow, never `ubuntu-latest`, the servers' release ([deploy-vps.md](deploy-vps.md#1-what-you-need);
`droplet_image` in `infra/terraform/digitalocean`), and the `ubuntu` tool image of the cloud-init
check. GitHub moves `ubuntu-latest` to a new release on its own schedule (Ubuntu 26.04, from
October 2026), which would change the system of every job without a commit. Dependabot proposes
only the `ubuntu` image's new digests, since it would read an interim release (24.10, whose
package archive closes when its nine months of support end) as a minor update. The next LTS moves
the runners, the servers and that image together, in one pull request with the full CI and E2E
(Android), once what the jobs install on the runner (`apt-get`: ccache; Playwright's browser
dependencies) and the Android emulator support it, and the servers' guides have been followed on
it.

### PostgreSQL and Redis

The development services (`docker-compose.yml`), CI's integration job (the tool images) and the
server (`deploy/vps/compose.yaml`) run the same images, pinned by tag and digest; Dependabot
proposes their new digests and minors, never a major. A major moves by hand, the three files
together, in one pull request with the full CI:

1. Read the release notes (removed settings, changed defaults).
2. `docker-compose.yml`, `deploy/vps/compose.yaml` (`db`, `backup`, `redis`) and
   `scripts/tool-images/Dockerfile`: the new tag and digest (the same digest in all: Docker Hub's,
   and ECR Public's mirror of Docker's official images in the tool images).
3. PostgreSQL in production: the managed database's major upgrade, by the provider's procedure,
   then `postgres_version` in `infra/terraform/digitalocean` to match (its validation lists the
   accepted majors), and a restore drill afterwards
   ([disaster-recovery.md](disaster-recovery.md#checklist)). On the server's own database, a dump
   and restore, since a data directory does not start under the next major: a backup at once
   (`backup.sh now`) copied off the server, the volume `app_db_data` removed, the release with the
   new image deployed (an empty database, its roles, every table), then that backup restored into
   it with the site stopped ([disaster-recovery.md](disaster-recovery.md#the-servers-own-database)).
   Rehearse it on staging first.
4. PostgreSQL's data directory does not start under the next major: dump the development database
   (`docker compose exec db pg_dump -U app app > dump.sql`), `docker compose down -v` (removes the
   volume), `pnpm services:up`, restore it (`docker compose exec -T db psql -U app app < dump.sql`),
   or start empty and run `pnpm db:migrate` and `pnpm db:seed`. Redis keeps nothing the API cannot
   rebuild: its volume can go.
5. `pnpm test:integration` and `pnpm iac:check` locally, then CI.

### Node.js

`.nvmrc` holds one exact version for CI and the Git hooks; `apps/mobile/eas.json`
(`build.base.node`) holds the same one for the build servers. A patch or minor release (security
releases are announced on nodejs.org) changes both files and nothing else.

A major moves once it is an LTS release (an even major, from its October):

1. `.nvmrc` and `apps/mobile/eas.json` `node`: the new version, released at least a week ago (the
   same delay as every dependency); the base image of `apps/api/Dockerfile` (both `FROM` lines),
   tag and digest.
2. `engines.node` in `package.json`, `apps/mobile/package.json` and `apps/api/package.json`: it
   accepts the new major already
   (`^24.15.0 || >=26.0.0`); drop the old one once everybody has moved. `engineStrict` refuses an
   install outside the range.
3. `pnpm add -D -w @types/node@^<major>`, `pnpm --filter mobile add -D @types/node@^<major>` and
   `pnpm --filter api add -D @types/node@^<major>` (each package declares it): Dependabot leaves its
   majors to this step.
4. Corepack is not part of Node.js 25 and later: developers install it first
   (`npm install -g corepack`, in the setup steps already). CI (`pnpm/action-setup`) and EAS
   (`apps/mobile/eas.json` `pnpm`) install pnpm without it.
5. The documents that name the major:
   `grep -rnE "Node\.js 24|24\.15|24 LTS" README.md CONTRIBUTING.md docs` (the manual and the
   step-by-step guide in both languages).
6. `pnpm install`, `pnpm verify` and `pnpm test:scripts`. On the pull request, CI and E2E (Android)
   run on the new version (`.nvmrc` is in the E2E workflow's paths); an EAS `preview` build then
   proves the build servers.

### pnpm

`packageManager` in `package.json` pins pnpm for developers (pnpm switches to it by itself) and CI
(`pnpm/action-setup` reads it); `pnpm-lock.yaml` records it with its checksum
(`packageManagerDependencies`); `apps/mobile/eas.json` (`build.base.pnpm`) pins it for the build
servers. Dependabot only rewrites dependency declarations, never `packageManager`.

1. Read the release notes: the settings of `pnpm-workspace.yaml` (the supply-chain policies) change
   between majors; `pnpm deps:check` (in `pnpm security`) checks they still hold.
2. `pnpm self-update <version>`, a release at least a week old: it rewrites `packageManager` (the
   project's `minimumReleaseAge` does not apply to `self-update`).
3. `pnpm install`: it records the version in `pnpm-lock.yaml`. Without it every
   `pnpm install --frozen-lockfile` fails ("Cannot update packageManagerDependencies").
4. `apps/mobile/eas.json` `pnpm`, and the version named in the manual and the step-by-step guide
   (both languages): the same version.
5. `pnpm verify`.

### TypeScript

Dependabot proposes TypeScript's patches only. A minor can change what type-checks (TypeScript does
not follow semantic versioning), and typescript-eslint supports a range of versions:
`pnpm view typescript-eslint peerDependencies` (`>=4.8.4 <6.1.0` with typescript-eslint 8.71, so
neither 6.1 nor 7 yet). Expo does not set the version: `expo install --check` only requires that
TypeScript is installed. Once typescript-eslint's range includes a new version:
`pnpm add -D -w typescript@~<version>`, `pnpm --filter mobile add -D typescript@~<version>` and
`pnpm --filter api add -D typescript@~<version>` (the root's tooling and both apps use the same
TypeScript), then `pnpm typecheck`, `pnpm lint` and `pnpm test`.
