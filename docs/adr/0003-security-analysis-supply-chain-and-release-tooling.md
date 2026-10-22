# 0003. Use Semgrep, zizmor, Dependabot and release-please for analysis, supply chain and releases

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

This is the web template's ADR 0001 (`project-template-web` 2.0), adopted for the whole workspace:
the Expo app (`apps/mobile`), the API (`apps/api`), the repository's scripts and its workflows. Both
templates share this tooling, so a fix to a gate moves from one to the other unchanged.

Type-aware linting, a dependency audit, secret scanning, SHA pinning and opt-in CodeQL are not
enough. Also needed: static analysis that runs on a private repository without GitHub Advanced
Security, an audit of the workflows themselves, a license policy, lockfile source checks, an SBOM,
image provenance, automated tool-image updates and a release process. Every addition must work on
any GitHub plan, run the same way locally and in CI, need no new runtime dependency, and stay quiet
enough that its failures are taken seriously.

Two things differ from the web template. The app binary is built and signed by EAS from a released
tag, started by a person, never by CI ([SECURITY.md](../../SECURITY.md#release-integrity)). The only
container images are the API's: `api` and its migration job, `api-migrate`.

## Options

1. **SAST:** CodeQL only (needs Advanced Security on private repositories); eslint-plugin-security
   (its most useful rule, object injection, is mostly false positives); **Semgrep CE** with the
   curated registry rulesets (any plan; TypeScript, React, Node.js, Express, JWT, secrets and
   Dockerfiles included; no suppression needed in this code base).
2. **Workflow security:** a homegrown script; **zizmor** (the dedicated auditor: permissions,
   injection, impostor commits, cache poisoning), next to actionlint.
3. **Licenses and SBOM:** license-checker / CycloneDX npm tools (new dependencies); **pnpm's
   built-in `licenses` and `sbom`** (nothing to add).
4. **Install-time supply chain:** the audit alone (it knows only published advisories); **pnpm's
   own settings** in `pnpm-workspace.yaml`, held in place by a check that fails when one is
   weakened.
5. **Dependency updates:** Renovate (more flexible; a third-party app or a hosted token);
   **Dependabot** (built in), with a cooldown equal to the release delay.
6. **Releases:** Changesets (per-package versions, a file per change); semantic-release (releases
   on every merge, plugins as dependencies); **release-please** (one release pull request from the
   Conventional Commits already enforced, no dependency, an action pinned by SHA).
7. **Artifact integrity:** cosign with keys; **BuildKit SBOM and provenance attestations** on push,
   with **GitHub attestations (Sigstore, keyless)** as an option where the plan allows.
8. **DAST:** none; a commercial scanner; OWASP ZAP, baseline and API scan, advisory (the web
   template's choice, run against a throwaway stack of its images).

## Decision

The options in bold. Each one closes a gap with the least new surface: pinned container images
declared in `scripts/tool-images/Dockerfile` so Dependabot updates them (actionlint, zizmor,
Semgrep, gitleaks, Trivy, and the integration job's PostgreSQL, Redis and Mailpit), one GitHub
Action (release-please), and pnpm features the workspace already depends on. Semgrep and zizmor
block a merge because they report nothing on this code base; CodeQL stays advisory and opt-in
(`ENABLE_CODEQL`) because it depends on the plan. As applied here:

- **Semgrep** (`pnpm sast`, `scripts/sast.mjs`, the CI job "Static analysis (Semgrep)") scans the
  files git tracks: the app, the API, the repository's scripts and the Dockerfiles. Any finding
  fails; a false positive is suppressed where it occurs, with its reason on the same line
  (`// nosemgrep: <rule> -- why`), so review sees it
  ([SECURITY.md](../../SECURITY.md#static-analysis)).
- **Install settings** (`pnpm-workspace.yaml`): a version must be public for seven days
  (`minimumReleaseAge`); a version published with weaker evidence than its predecessors is refused
  (`trustPolicy: no-downgrade`); transitive dependencies from outside the registry are refused
  (`blockExoticSubdeps`); install scripts run only where `allowBuilds` says so. Three packages may
  run one, all the API's: `argon2` (its native binding) and `prisma` and `@prisma/engines` (their
  platform engines). Advisories without a fix are handled in the open (`overrides`, `audit.ignore`),
  each with its reason ([SECURITY.md](../../SECURITY.md#known-advisories)).
- **Dependency policy** (`pnpm deps:check`, part of `pnpm security`, so of `pnpm verify` and CI):
  `scripts/check-dependencies.mjs` enforces `scripts/dependency-policy.json`. Every package comes
  from the registry with a sha512 integrity hash; licenses come from an allowlist (wider for
  development-only packages, named exceptions with their reason, such as the Sentry CLI the app's
  build runs); and the install settings above keep their values: a weakened setting, or an exception
  without its recorded reason, fails ([SECURITY.md](../../SECURITY.md#dependency-policy)).
- **Dependabot** proposes npm packages, GitHub Actions, the API's base images, the tool images and
  the Compose services every week, with a seven-day cooldown; Expo SDK packages move together
  through SDK upgrades ([ci-cd.md](../ci-cd.md#dependency-updates)).
- **One version for the whole repository** ([ADR 0002](0002-pnpm-monorepo.md)): release-please
  bumps the root `package.json`, `apps/mobile/package.json`, `apps/api/package.json` and
  `openapi/openapi.json` (`info.version`) together and writes `CHANGELOG.md`. Merging its pull
  request tags `vX.Y.Z` (tags are immutable, `.github/rulesets/tags.json`) and publishes the GitHub
  release with a CycloneDX SBOM of the production dependencies, generated in a read-only job and
  attached by another that installs nothing ([ci-cd.md](../ci-cd.md#workflow-security)). Building
  and submitting that version is a separate, manual EAS step.
- **Images** (`.github/workflows/docker-images.yml`): CI builds `api` and `api-migrate` and scans
  each with Trivy (a HIGH or CRITICAL advisory with a published fix fails), and never pushes them.
  The workflow pushes only when called with `push`, then with BuildKit's SBOM and SLSA provenance
  attestations; the signed GitHub attestation is written there, commented out, for plans that allow
  it.
- **No dynamic analysis:** the web template's ZAP workflow is not part of this repository.

## Consequences

- `pnpm verify` also checks licenses, dependency sources and the install settings; `pnpm sast` and
  `pnpm lint:workflows` need Docker locally (CI always runs them).
- A dependency younger than seven days does not install. An urgent fix is exempted by its exact
  version (`minimumReleaseAgeExclude`), recorded in the policy with its reason and an expiry date,
  from which `pnpm deps:check` fails until both entries are deleted. A new dependency that wants an
  install script stops the install until it is reviewed and recorded.
- Semgrep fetches its rulesets at each run: a new rule can flag existing code, and CI needs the
  registry reachable. If that becomes noisy or fragile, vendor the rules into the repository.
- `RELEASE_PLEASE_TOKEN` is optional: without it, the release workflow starts CI and Conventions on
  the release branch itself ([ci-cd.md](../ci-cd.md#release-pull-requests)).
- The SBOM describes the npm packages of the tag, not the native libraries Gradle and CocoaPods
  resolve during an EAS build; EAS keeps the build itself
  ([SECURITY.md](../../SECURITY.md#dependencies)). Signed attestations and their verification at
  deploy time are left to each project's plan and registry.
- Without dynamic analysis, what the API answers at runtime (security headers, the error envelope,
  no caching) is checked by its integration specs (`apps/api/src/app.int.spec.ts`), not by a
  scanner.
- Wrong if: blocking analyzers produce false positives often enough that suppressions become
  routine, or Dependabot cannot keep the tool images current. Then revisit (Renovate, vendored
  rules).
