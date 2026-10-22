# 0009. Run PostgreSQL and Redis on the reference server, and Redis in development

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** template maintainers

## Context

The app needs its server side in production: the API it calls, and the web image with the public
site, the app's links and their files ([ADR 0008](0008-public-site-and-app-links.md)). The web
template ships a reference deployment for exactly these images (`deploy/vps`: Caddy, the web image,
the API, its migration job), and decided in its ADR 0006 to run PostgreSQL and Redis on that server
too, with a managed PostgreSQL still possible. This repository adopts the same deployment
([ADR 0002](0002-pnpm-monorepo.md): the public image keeps the name `web` so `deploy/vps`,
`deploy.yml`, `docker-images.yml` and the smoke test stay the web template's, and fixes port from
one to the other).

The API already has Redis-backed adapters with in-process fallbacks: shared rate limits, cache,
locks and idempotency ([ADR 0004](0004-observability-and-optional-infrastructure.md)). A project
starting on one server would otherwise need a second paid service, the managed database, before its
first deployment; and the Redis paths would run only in CI, not in development or on the server.

The constraints: least privilege for every component, nothing published beyond the server, images
pinned by digest and updated by Dependabot, the same images in development, CI and on the server,
backups that are restored and checked, not only taken, and a managed database still possible
(Terraform builds one on DigitalOcean). One more is the app's: installed apps are not updated with
the server, so a deployment never breaks the versions still in use (expand and contract,
[database.md](../database.md#expand-and-contract)), and a rollback of the server is always possible.

## Options

1. **Keep the managed database required and Redis optional:** the least to run on the server; but a
   second paid service from the first day, and the Redis paths untested outside CI.
2. **PostgreSQL and Redis on the server as compose services, the managed database still possible:**
   one server is enough to start, with pinned images, roles and an ACL the template creates, and a
   nightly logical backup on the server; but the data lives on the server, the copy off it is the
   project's to set up, and a nightly dump means up to a day of data lost.
3. **PostgreSQL on the server with base backups and WAL archiving** (pgBackRest, WAL-G): minutes of
   data lost at most; but another moving part, an object store with its credentials and monitoring,
   that the template would have to ship and test for every project.
4. **A container platform for the server side** (Kubernetes, ECS, Cloud Run...): scaling and
   managed rollouts; but a platform to choose for every project, and nothing the template could
   ship ready. `deploy.yml` keeps a generic `release` job for it.

## Decision

Option 2, the web template's deployment unchanged, with Redis on wherever the template runs the
infrastructure:

- **Development:** `pnpm services:up` starts Redis with the database and Mailpit, on loopback port
  6399 with the password `app`; `apps/api/.env.example` points the API at it, and the
  production-like stack (`docker compose --profile stack`) runs on it with the shared stores and
  `REDIS_REQUIRED=true`.
- **The server:** Redis always, with an ACL user limited to the API's key prefix and the commands
  its adapters run, the default user off. PostgreSQL 18 behind the `db` profile, on by default in
  `server.env.example`: the database and three roles (`app_migrator`, `app_runtime`, `app_backup`)
  created by `db-init.sh` at the first start, and a nightly `pg_dump` kept 7 days, with a health
  check. All of it on an internal network, every container hardened. Without the profile, the
  managed database: the path Terraform builds.
- **Deployments:** `deploy.sh` starts the data services before the migration, and stops a
  deployment, the running release unchanged, when they do not become healthy. `pnpm iac:check` runs
  `db-init.sh` on PostgreSQL in CI.
- **What the app adds:** `web.env` carries the app's identity for the link files, the edge
  forwards every path as it came (Apple and Google refuse a redirect for those files), the web
  image serves `/release.json` so the deployment's smoke test checks the release it rolled out, and
  the API's `MOBILE_MIN_VERSION_*` live in `api.env`.

## Consequences

- Easier: one server is a complete deployment of the server side; development, CI and the server
  run the same Redis paths; the restore on the server is written down and rehearsed
  ([disaster-recovery.md](../disaster-recovery.md#the-servers-own-database)); a fix to the
  deployment ports between the two templates file by file.
- Harder: the server holds the data, so losing it loses up to a day, and everything if the copy off
  the server was not set up (REQUIERE CONFIGURACIÓN, [deploy-vps.md](../deploy-vps.md#backups)). A
  PostgreSQL major on the server is a dump and restore
  ([ci-cd.md](../ci-cd.md#postgresql-and-redis)). The database's passwords live in files on the
  server, and a change there must be made in PostgreSQL too. An outage of this one server is an
  outage of every installed app's API.
- Done with it: the compose files, `db-init.sh`, `backup.sh`, `deploy.sh` and its tests, the CI
  checks (`iac`, `observability`), the Deploy and DAST workflows, and the guides (deploy-vps.md,
  disaster-recovery.md, incident-response.md, alerting.md, environment.md, security.md, both
  manuals and both step-by-step guides).
- Wrong if: projects need minutes of recovery point from the first day (then option 3, or the
  managed database by default), the server cannot hold the database next to the API, or a second
  server comes early (then a managed PostgreSQL and a Redis over TLS, which the managed path and
  `rediss://` already support).
