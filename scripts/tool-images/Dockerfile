# syntax=docker/dockerfile:1
# Never built. The container images of the tools that CI and the local
# commands run (pnpm sast, pnpm lint:workflows, the gitleaks CI step), pinned
# by tag for readers and by digest for the runner: a moved tag cannot change
# what runs with the repository checked out. Written as a Dockerfile so
# Dependabot (the docker entry in .github/dependabot.yml) proposes tag and
# digest updates together; kept outside .github/, where Dependabot may change
# files for GitHub Actions only (dependabot/dependabot-core#15237).
# scripts/tool-image.mjs reads it: one `FROM <image> AS <name>` per tool.
#
# Docker Hub limits anonymous pulls per address, and CI runners share theirs:
# the images hosted there (actionlint, Semgrep) are pulled in CI through a
# mirror, by digest (scripts/tool-image.mjs).

# Workflow linting: actionlint (syntax, expressions, shellcheck) and zizmor
# (security: permissions, injection, pinning, credential persistence).
FROM rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 AS actionlint
FROM ghcr.io/zizmorcore/zizmor:1.31.1@sha256:42d409dbb851d4c5d35a058cf042b828bea1e3f2884378c526eb0974780e18d9 AS zizmor

# Static application security testing.
FROM semgrep/semgrep:1.180.0@sha256:529ee8a277ec8adc5b534d7c74eea0a47e9de21d62852b6ba7ac6ba9566845c3 AS semgrep

# Secrets in the git history.
FROM ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS gitleaks
