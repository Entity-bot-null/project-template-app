# syntax=docker/dockerfile:1
# Never built. The container images of the tools that CI and the local
# commands run (pnpm sast, pnpm lint:workflows, the gitleaks CI step), pinned
# by tag for readers and by digest for the runner: a moved tag cannot change
# what runs with the repository checked out. Written as a Dockerfile so
# Dependabot (the docker entry in .github/dependabot.yml) proposes tag and
# digest updates together. scripts/tool-image.mjs reads it: one
# `FROM <image> AS <name>` per tool.
#
# Docker Hub limits anonymous pulls per address, and CI runners share theirs:
# the images hosted there (actionlint, Semgrep) are pulled in CI through a
# mirror, by digest (scripts/tool-image.mjs).

# Workflow linting: actionlint (syntax, expressions, shellcheck) and zizmor
# (security: permissions, injection, pinning, credential persistence).
FROM rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 AS actionlint
FROM ghcr.io/zizmorcore/zizmor:1.30.1@sha256:a2eb396d886c053073405c7a980f2139ba2248ec172243cfa3841e57196e8101 AS zizmor

# Static application security testing.
FROM semgrep/semgrep:1.179.0@sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b AS semgrep

# Secrets in the git history.
FROM ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS gitleaks
