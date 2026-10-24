# syntax=docker/dockerfile:1
# The web image (named web, as in the web template, though it is built from
# apps/landing): the site behind nginx, one origin for everything public. The
# landing at / and /es/, the app's links at /app/* (the phone opens them in
# the app; anywhere else this answers them with the open-in-app page), the
# files that let the phones claim those links at /.well-known/, and /api
# forwarded to the API. The build context is the repository root:
#   docker build -f apps/landing/Dockerfile -t web .
# APP_ORIGIN (the site's public origin) is required; API_UPSTREAM (default
# http://api:3000) is where /api goes; the app's identity for its link files
# is optional (docs/environment.md#web-variables).
#
# Base images by tag and digest, so a build is reproducible and a moved tag
# changes nothing; Dependabot proposes tag and digest together. Node.js 24
# (.nvmrc) from ECR Public's mirror of Docker's official images, nginx from
# NGINX's own registry on GHCR: the same images as Docker Hub, without its
# anonymous pull limit.
FROM public.ecr.aws/docker/library/node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
# package.json comes along for its packageManager pin: without it Corepack
# would fetch the newest pnpm instead of the pinned one.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter landing
# Built for a placeholder origin (the .invalid domain is reserved, RFC 2606):
# nginx writes the deployment's APP_ORIGIN in its place as it serves the
# pages (nginx/default.conf.template), so this one image serves every
# environment.
RUN PUBLIC_URL=https://public-origin.invalid pnpm --filter landing build

# Runs as an unprivileged user on port 8080.
FROM ghcr.io/nginx/nginx-unprivileged:1.31-alpine@sha256:a2545a4b4fdebc62bd6a624ba64bea3a1b8bb6e71deabe973ceec621349d5301 AS runtime
# Operating system fixes published after the base image was built (the image
# scan in CI fails on a fixable HIGH or CRITICAL advisory). The day of those
# fixes (CI passes today's date) is part of the cache key of the upgrade: a
# build cache would otherwise replay the first build's upgrade until the base
# digest changes. The default keeps local builds cached.
USER root
ARG OS_UPGRADE_DATE=local
RUN apk upgrade --no-cache
USER 101
# The build this image holds (CI passes the commit SHA), for `docker inspect`,
# the deployment's records and /release.json.
ARG APP_RELEASE=unversioned
# Runtime settings (docs/environment.md#web-variables): APP_ORIGIN has no
# default, so a deployment that forgets it stops at start with the variable's
# name. The app's identity is empty until the project sets it: the link
# files then answer 404, and the phones open /app/* links in the browser,
# on the open-in-app page.
ENV API_UPSTREAM=http://api:3000 \
    APP_ORIGIN="" \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    APP_RELEASE=${APP_RELEASE} \
    APPLE_TEAM_ID="" \
    IOS_BUNDLE_ID="" \
    ANDROID_PACKAGE="" \
    ANDROID_SHA256_CERT_FINGERPRINTS=""
COPY --chmod=0755 apps/landing/nginx/18-validate-runtime-config.sh /docker-entrypoint.d/18-validate-runtime-config.sh
COPY --chmod=0755 apps/landing/nginx/19-app-links.sh /docker-entrypoint.d/19-app-links.sh
COPY apps/landing/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY apps/landing/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/landing/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
