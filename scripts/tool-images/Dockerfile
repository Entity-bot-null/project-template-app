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
# Where an image is published outside Docker Hub with the same digest, it is
# pulled from there: Docker Hub limits anonymous pulls per address, and CI
# runners share theirs. The ones left on Docker Hub (actionlint, Semgrep,
# Mailpit), and the ECR Public ones (ECR Public limits anonymous pulls too),
# are pulled in CI through a mirror of Docker Hub, by digest
# (scripts/tool-image.mjs).

# Workflow linting: actionlint (syntax, expressions, shellcheck) and zizmor
# (security: permissions, injection, pinning, credential persistence).
FROM rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 AS actionlint
FROM ghcr.io/zizmorcore/zizmor:1.31.1@sha256:42d409dbb851d4c5d35a058cf042b828bea1e3f2884378c526eb0974780e18d9 AS zizmor

# Static application security testing.
FROM semgrep/semgrep:1.181.0@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b AS semgrep

# Secrets in the git history.
FROM ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS gitleaks

# Image vulnerability scanning (.github/workflows/docker-images.yml).
FROM ghcr.io/aquasecurity/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c AS trivy

# Test database of the integration job; keep the major version equal to
# docker-compose.yml.
FROM public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 AS postgres

# Redis of the integration job (the Redis-backed adapters); keep the major
# version equal to docker-compose.yml.
FROM public.ecr.aws/docker/library/redis:8-alpine@sha256:3811787313eba226a2ef38658c6ccb91cd5e110edc89c37767de373120a0e5a0 AS redis

# Mail catcher of the integration job: the outbox specs send real SMTP to it
# and read the messages back through its API. Keep the version equal to
# docker-compose.yml.
FROM axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea AS mailpit
