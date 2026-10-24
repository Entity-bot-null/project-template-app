# Incident response

How to run an incident with what the template already emits: the API's health probes, structured
logs with request ids, the 5xx origin (`error.origin`), metrics and traces (OpenTelemetry,
OPTIONAL), error reports of the API and the app (Sentry, OPTIONAL), the stores' and EAS's own
views of the app's releases. No incident-management platform is assumed; the alerts that start an
incident are in [alerting.md](alerting.md), restores in [disaster-recovery.md](disaster-recovery.md).

## Roles and contacts

REQUIERE CONFIGURACIÓN: fill this table in for the project and keep it current; an incident is the
wrong time to look for a phone number.

| Role                        | Who                                                    | How to reach               |
| --------------------------- | ------------------------------------------------------ | -------------------------- |
| Service owner               | _team or person_                                       | _channel_                  |
| Primary / secondary on-call | _rotation_                                             | _paging tool or phone_     |
| Incident commander (SEV1)   | _rotation or engineering lead_                         | _channel_                  |
| Security contact            | the private contact of `SECURITY.md`                   | _restricted channel_       |
| Database and platform owner | _team or provider_                                     | _channel, provider ticket_ |
| Release owner (stores, EAS) | _who can halt a store rollout and run EAS rollback_    | _channel_                  |
| External providers' support | _one line per provider (Sentry, cloud, Expo, SMTP...)_ | _support URL, contract id_ |

**Severity:** SEV1 = outage, data loss or a security breach (CRITICAL alerts); SEV2 = a feature, a
platform or a share of users degraded (CRITICAL or persistent WARNING); SEV3 = minor, no user
impact yet (WARNING). The incident commander of a SEV1 coordinates and communicates; others fix.

## The first five minutes

1. **Acknowledge** the alert and open an incident record: time, who, the alert, the link to the
   dashboard. Every later step goes in it with its time.
2. **What changed?** The server: the latest deployments (Deploy workflow runs; the `release` field
   of the API's log lines and the web image's `/release.json` say which commit is running),
   configuration or secret changes (a raised `MOBILE_MIN_VERSION_*` among them), migrations,
   provider maintenance. The app: a store release reaching more users (staged rollout, phased
   release), an OTA update (EAS update workflow runs, `eas update:list`).
3. **How big?** Readiness of each instance, the 5xx rate by `error.origin` and `http.route`, uptime
   checks, Sentry's users per issue (the API's and the app's projects), one platform or both.
4. **Roll back first** when the start matches a change: the server's previous image digests
   ([9. Failed deployment](#9-failed-deployment)), the previous OTA update or a halted store
   rollout ([17. A bad app release or OTA update](#17-a-bad-app-release-or-ota-update)); the root
   cause can wait for a stable system.
5. **Communicate:** who is on it, what users see, when the next update comes.

## Where to look

| Question                      | Look at                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is an instance ready?         | `curl http://<api>:3000/api/health/ready` from inside the platform (the public URL answers 404 for probes)                                                                                                                                         |
| Is the public side up?        | `pnpm smoke --url <public URL>` (read-only; add `--api <API URL>` from inside the platform, `--require-app-links` once the app's identity is set)                                                                                                  |
| What happened to one request? | The `X-Request-Id` the app sent and got back: the log lines with that `requestId`, its Sentry report (`request_id` tag), its trace (`app.request_id`)                                                                                              |
| Where do the 5xx come from?   | `app_server_errors_total` by `error_origin` and `http_route`; the error line `METHOD /path -> 5xx (request <id>, <origin>)`                                                                                                                        |
| Which version is running?     | The API: `release` on the log lines and spans (`service.version`). The web image: `/release.json`. The app: release, build and `update.id` on its Sentry events                                                                                    |
| Is the database the problem?  | Readiness `Database unreachable`, `error.origin=database`, `db_client_connection_*` pool metrics, `Slow query` warnings                                                                                                                            |
| Is Redis the problem?         | Readiness `checks.redis`, `Redis unavailable`, `Redis is not answering` and the matching recovery lines, `app_degraded_operations_total`                                                                                                           |
| The overall picture?          | Grafana → Application: "API service" (traffic, errors by origin, runtime, database, Redis, dependencies, email, installed apps, push), "API SLOs" (budget, burn rates)                                                                             |
| Is the app the problem?       | The app's Sentry project by release, build and `update.id`; its `network` breadcrumbs carry the request ids of the calls that failed ([observability.md](observability.md#the-app)); Play Console's Android vitals and App Store Connect's crashes |
| Are old apps refused?         | `app_client_outdated_total` by `app_platform` ("API service" → Installed apps); the API's `MOBILE_MIN_VERSION_*`                                                                                                                                   |
| Is a provider the problem?    | `app_dependency_duration_seconds` by `dependency_name` and `outcome`, `External:<name>` log lines, the provider's status page                                                                                                                      |

PromQL for each metric: [observability.md](observability.md#metrics). Log patterns:
[alerting.md](alerting.md#log-patterns).

## Runbooks

Each runbook: the alerts that open it, symptoms, impact, first checks, signals, immediate actions,
mitigation, when to roll back, when it is recovered, what to validate afterwards, what to document.
The alerts are the rules of `observability/prometheus/rules`, whose `runbook_url` points at these
sections and whose `dashboard_uid` names the dashboard to open first
([observability.md](observability.md#alerts)). The general rule for rollback: if the problem
started with a deployment or a release, roll back first and investigate after. A mobile release
cannot be rolled back on the phones that installed it: the server stays compatible with every app
version still in use ([api-conventions.md](api-conventions.md)).

### 1. API down

- **Alerts:** `ApiMetricsAbsent` (no metrics at all); the external uptime checks.
- **Symptoms:** every screen of the app that loads data shows its error state; `/api/*` answers
  the web server's `502 {"message":"The API could not be reached"}` (or 504) while `/healthz` (the
  web server alone) still answers 200; no access log lines from the API.
- **Impact:** total for signed-in use: the app opens, nothing loads, nobody can sign in. The
  landing, the app's links and their files still serve (the web image).
- **First checks:** are the API containers running or restarting (platform events, exit codes)?
  The last lines of an instance: an `Environment variable X is invalid` line at boot means a
  configuration change; `fatal` lines mean a crash ([8](#8-repeated-application-crashes)); exit
  code 137 means killed for memory ([7](#7-memory-or-cpu-pressure)). The web server's error log:
  `connect() failed` or `could not be resolved` for the API upstream.
- **Signals:** container restarts; `level=fatal`; the boot line `Starting release <sha> in <env>`;
  no `http_server_request_duration_seconds` samples at all.
- **Immediate actions:** a deployment or configuration change in the last hour: roll it back
  (redeploy the previous digests, restore the previous variable). Otherwise follow the cause above.
- **Mitigation:** add capacity if instances are killed for memory or CPU; check that `API_UPSTREAM`
  resolves from the web container (nginx looks it up again every 10 seconds).
- **Roll back when:** it started within the window of a deployment or configuration change.
- **Recovered when:** every instance is ready, the smoke test passes, the 5xx rate is back to its
  baseline for 15 minutes.
- **Validate after:** `pnpm smoke --url <public URL> --api <API URL>`; sign in with a test account
  in the app; the uptime checks are green from every location.
- **Document:** time of first failure, of detection and of recovery; the trigger; why no earlier
  alert fired, if none did.

### 2. Readiness failing

- **Alerts:** `ApiReadinessFailing`.
- **Symptoms:** instances marked unready, taken out of the load balancer; `GET /api/health/ready`
  answers 503 with the reason in the message: `Database unreachable`, `Redis unreachable` (only
  with `REDIS_REQUIRED=true`) or `Shutting down`. `status: "degraded"` with 200 is not a failure.
- **Impact:** some instances: less capacity, higher latency. All instances: an outage.
- **First checks:** the message decides: database → [3](#3-database-unavailable); Redis →
  [4](#4-redis-unavailable); `Shutting down` outside a deployment → something sends SIGTERM
  (autoscaling, node drain: platform events). A probe that times out instead of answering points
  at a blocked event loop or CPU starvation ([7](#7-memory-or-cpu-pressure)): readiness answers
  within 2.5 seconds whatever its dependencies do, so give the probe a timeout of 3 seconds or
  more.
- **Signals:** the warning `Readiness: database unreachable (<driver message>)` or
  `Readiness: Redis unreachable (REDIS_REQUIRED=true)`; ready instance count.
- **Immediate actions:** do not restart instances in a loop: liveness still answers 200 on
  purpose, and a restart does not fix a dependency. Fix the dependency.
- **Mitigation:** if a new hard dependency came with a deployment, roll back.
- **Roll back when:** the failure started with a deployment.
- **Recovered when:** every instance is ready for 10 minutes.
- **Validate after:** readiness on each instance; the smoke test.
- **Document:** which dependency, how long, how many instances.

### 3. Database unavailable

- **Alerts:** `ApiDatabaseErrors`; often `ApiReadinessFailing` with it.
- **Symptoms:** readiness 503 `Database unreachable`; 5xx lines ending `, database)`;
  `app_server_errors_total{error_origin="database"}` rising; Sentry issues with
  `error.origin: database`; failing pg spans. The API keeps running (it even starts without a
  database, and says so: `Database unreachable at boot`), so this is not a crash loop.
- **Impact:** every screen of the app that loads or saves data fails. Signed-in users stay signed
  in: the app keeps its refresh token, and a renewal that fails with a server error or without a
  network never signs anyone out; only a 401 on renewal does ([security.md](security.md#sessions)).
- **First checks:** the driver's message in the readiness warning: `ECONNREFUSED` or a timeout
  (down, failover, network), `too many clients already` (connection limit),
  `password authentication failed` (rotated credentials), an SSL error (TLS settings),
  `the database system is in recovery mode` (restart or failover). The provider's status,
  maintenance and failover events; storage free space. The VPS target's own database:
  `docker compose ... ps db` and `logs db` on the server, and its free disk (`df -h /`).
- **Signals:** `db_client_connection_count` by state, `db_client_connection_pending_requests`;
  the provider's CPU, connections, storage and replication metrics.
- **Immediate actions:** a failover in progress: wait; the pool reconnects on its own. Connection
  limit reached: the instances × `DB_POOL_MAX` must fit in the database's limit
  ([database.md](database.md#connections)); look for idle or stuck sessions in `pg_stat_activity`
  and end them (`pg_terminate_backend`). A migration holding a lock: cancel it
  ([10](#10-failed-database-migration)).
- **Mitigation:** scale the database, free storage, restore the previous credentials or rotate
  them everywhere at once (on the VPS target's own database, PostgreSQL first:
  [deploy-vps.md](deploy-vps.md#change-a-setting-or-a-secret)). Data lost:
  [disaster-recovery.md](disaster-recovery.md).
- **Roll back when:** a deployment changed `DATABASE_URL`, `DB_POOL_MAX` or ran a migration just
  before.
- **Recovered when:** readiness 200 everywhere, no `database` errors for 15 minutes, no pending
  pool requests.
- **Validate after:** the smoke test; the data written just before the outage is there (requests
  that failed were rolled back and answered 5xx with a request id).
- **Document:** cause, duration, number of failed requests, whether data was lost.

### 4. Redis unavailable

- **Alerts:** `ApiDegradedMode` (`feature`, `dependency_name` labels).
- **Symptoms:** `Redis unavailable (<host>): <reason>` once per outage, or
  `Redis is not answering (<host>)` when it stays connected but stops replying; readiness
  `status: "degraded"`, `checks.redis: "unavailable"` (200);
  `Rate limiting falls back to per-instance counters`; `Cache unavailable, serving from the source`;
  `app_degraded_operations_total` rising. With `REDIS_REQUIRED=true`: readiness 503
  `Redis unreachable`, also while Redis answers but refuses writes (`OOM`, `MISCONF`, `READONLY`,
  `NOPERM`: readiness writes a key under the prefix), so `deploy.sh` and `rollback.sh` report the API
  not ready until Redis accepts writes again: fix Redis first.
- **Impact:** degraded, not down: rate limits count per instance (more permissive by the number of
  instances), every cache read goes to the database (more database load), locks and idempotency
  claims fail closed (503 `Service temporarily unavailable, retry later`, logged
  `dependency: redis`): jobs skip their run, and a write the app sends with an `Idempotency-Key`
  is refused; the app shows its retry state and the person tries again. Redis holds nothing that
  must survive ([disaster-recovery.md](disaster-recovery.md#what-to-protect)).
- **First checks:** the reason in the line: `ECONNREFUSED` or a timeout (down, network), `WRONGPASS`
  or `NOAUTH` (credentials changed), `LOADING` (Redis restarting and loading its data, transient),
  `OOM command not allowed` (memory full), `NOPERM` (a key or command outside the ACL: another
  `REDIS_KEY_PREFIX` than the ACL line's, or a command it does not list; PING still answers, but
  readiness, which writes under the prefix, reports Redis unavailable). The
  provider's status and memory metrics; on the VPS target, `docker compose ... ps redis` and
  `logs redis` on the server.
- **Signals:** node-redis command metrics (errors, duration), database latency (cache misses).
- **Immediate actions:** none needed in the application: it reconnects by itself (backoff up to
  5 seconds). Watch database load and latency while the cache is out.
- **Mitigation:** restart or fail over Redis (on the VPS target,
  `docker compose ... up -d --wait redis`); restore the credentials; `NOPERM`: the same prefix and
  the adapters' commands in the ACL line of `deploy/vps/compose.yaml` (docs/deploy-vps.md), or the
  previous `REDIS_KEY_PREFIX`; memory full: every key the
  template writes has a TTL, so check the eviction policy and what else writes to that Redis.
- **Roll back when:** a deployment changed `REDIS_URL` or the stores.
- **Recovered when:** `Redis connection restored after <n>s` or `Redis answering again after <n>s`,
  `Rate limiting uses the shared Redis counters again`, `Cache available again`; readiness `ok` on
  every instance.
- **Validate after:** `app_degraded_operations_total` stops increasing; work skipped by locks ran
  on its next schedule.
- **Document:** duration, what was refused while it failed closed, database load during the outage.

### 5. High 5xx rate

- **Alerts:** `ApiAvailabilityBudgetFastBurn` (CRITICAL), `ApiAvailabilityBudgetSlowBurn`,
  `ApiRouteErrorRatioHigh` (one route).
- **Symptoms:** availability burn rate alert; Sentry spike; 5xx lines
  `METHOD /path -> 5xx (request <id>, <origin>)`.
- **Impact:** the routes affected, for every user who calls them.
- **First checks:** split `app_server_errors_total` by `error_origin`, `http_route` and the
  release (`service.version`): `application` is a bug, usually of the latest release;
  `database` → [3](#3-database-unavailable); `dependency: <name>` →
  [12](#12-external-dependency-outage) (`dependency: redis` → [4](#4-redis-unavailable));
  `unavailable` is a deliberate 503 (readiness, shutdown). 502 or 504 from the web server without
  an API line → [1](#1-api-down) or [6](#6-high-latency).
- **Signals:** the stack trace in the error line or the Sentry issue; the trace of a failing
  request (`app.request_id`).
- **Immediate actions:** errors from the new release: roll back.
- **Mitigation:** a hotfix through the normal pipeline when a rollback is impossible (a contract
  the installed apps already use).
- **Roll back when:** the errors started with a deployment and belong to the new release.
- **Recovered when:** the burn rate is below 1 for 30 minutes.
- **Validate after:** the Sentry issue has no events in the fixed release; the smoke test.
- **Document:** budget spent ([alerting.md](alerting.md#error-budget)), root cause, the test that
  now covers it.

### 6. High latency

- **Alerts:** `ApiLatencyBudgetFastBurn` (CRITICAL), `ApiLatencyBudgetSlowBurn`,
  `ApiRouteLatencyHigh` (one route), `ApiDatabasePoolSaturated`.
- **Symptoms:** p95 or p99 of `http.server.request.duration` above the latency SLO, latency burn
  rate alert, users reporting a slow app; the web server's access log `request_time`.
- **Impact:** slow screens; past 15 seconds the app gives up on a request (`timeout`) and shows its
  retry state; retries add load.
- **First checks:** which routes (`http_route`); the database (`db.client.operation.duration`,
  `Slow query (<n> ms): <statement>` warnings, `db_client_connection_pending_requests` above zero
  means the pool is exhausted); dependencies (`app_dependency_duration_seconds` p95 per
  dependency); the event loop (`nodejs.eventloop.delay.p99`), CPU throttling; Redis down (cache
  misses, [4](#4-redis-unavailable)). A slow trace shows which span takes the time.
- **Immediate actions:** a deployment correlates: roll back. CPU-bound instances: add instances,
  if the database has connections to spare (instances × `DB_POOL_MAX`).
- **Mitigation:** the index a slow statement needs (`EXPLAIN ANALYZE` on a copy); cancel runaway
  queries (`pg_stat_activity`, `pg_cancel_backend`); raise `DB_POOL_MAX` only when the pool wait
  is the bottleneck and the database has headroom.
- **Roll back when:** the slowdown started with a deployment.
- **Recovered when:** p95 and p99 below the threshold for 30 minutes.
- **Validate after:** no pending pool requests; slow query count back to normal.
- **Document:** the slow component, the fix, the load at the time (for capacity planning,
  [load-testing.md](load-testing.md)).

### 7. Memory or CPU pressure

- **Alerts:** `ApiEventLoopDelayHigh`.
- **Symptoms:** CPU near the container's limit or throttled; `process.memory.usage` (RSS) or
  `v8js.memory.heap.used` growing toward the memory limit; longer `v8js.gc.duration`; event loop
  delay; restarts with exit code 137 (killed for memory).
- **Impact:** latency first, then restarts and failed requests.
- **First checks:** traffic grew (load), traffic is flat but memory climbs (a leak: a sawtooth that
  resets at each restart), or it started with a release (a regression). One instance or all?
- **Immediate actions:** release-related: roll back. Load: add instances (check the database
  connection budget) or raise the limits.
- **Mitigation:** for a leak, a rolling restart buys time; it is not a fix. Take a heap snapshot
  of one instance outside peak hours (Node.js `--heapsnapshot-signal` through `NODE_OPTIONS`) and
  compare two snapshots.
- **Roll back when:** it started with a deployment.
- **Recovered when:** below the warning thresholds for an hour without a restart.
- **Validate after:** memory flat over a full traffic cycle.
- **Document:** growth rate, the culprit, whether limits or capacity planning must change.

### 8. Repeated application crashes

- **Symptoms:** API instances restarting in a loop; `fatal` lines `uncaughtException: <stack>` or
  `unhandledRejection: <stack>` (the process exits on purpose after logging and reporting them);
  Sentry events with level fatal and `error.origin: process`. Crashes of the app itself:
  [17](#17-a-bad-app-release-or-ota-update).
- **Impact:** from lost requests to an outage, depending on how many instances crash.
- **First checks:** the stack in the `fatal` line; whether the crash follows a specific request
  (the lines just before it, the same route each time: a "poison" request); the boot line and any
  `Environment variable X is invalid` line (a configuration change stops the boot, by design); exit
  code 137 → [7](#7-memory-or-cpu-pressure).
- **Immediate actions:** roll back the release or the configuration change. A poison request from
  outside: block it at the edge (WAF rule, path or client) until the fix ships.
- **Mitigation:** the fix with a test that reproduces the crash.
- **Roll back when:** crashes started with a deployment or configuration change.
- **Recovered when:** no restart for 30 minutes and no new `fatal` line.
- **Validate after:** the smoke test; the poison request, if any, now answers a 4xx or 5xx without
  a crash.
- **Document:** the stack, the trigger, why it was not caught by tests.

### 9. Failed deployment

- **Symptoms:** the Deploy workflow failed at a step (gates, image push, migration, rollout, smoke
  test), or alerts fired right after a rollout.
- **Impact:** none if it failed before the rollout (the running version is untouched); otherwise
  old and new versions may be serving side by side.
- **First checks:** which step. Before the migration: nothing changed in the environment, fix and
  run again. Migration → [10](#10-failed-database-migration). Rollout or smoke test: which
  `release` each instance runs, and which one `/release.json` answers.
- **Immediate actions:** rollout or smoke test failed: redeploy the image digests recorded before
  the deployment ([ci-cd.md](ci-cd.md#rollback)). That is faster and safer than running Deploy
  with the previous tag: Deploy re-runs every gate, and an advisory published since then could
  block it.
- **Mitigation:** fix forward through a new pull request once the previous version serves.
- **Roll back when:** the smoke test failed, or errors or latency rose after the rollout. Do not
  fix forward under a live incident unless a rollback is impossible.
- **Recovered when:** one version serves everywhere and the smoke test passes with its `--release`.
- **Validate after:** `pnpm smoke --url <public URL> --api <API URL> --release <sha>`; error rate
  and latency at their baseline.
- **Document:** the failing step, the rollback time, what the gates missed.

### 10. Failed database migration

- **Symptoms:** the `api-migrate` job exits with `Error: P3018 A migration failed to apply` and the
  database error; later runs fail with `P3009 migrate found failed migrations`; or the job hangs on
  a lock and the deployment times out. Two more stop it before any statement runs:
  `P1002 ... Timed out trying to acquire a postgres advisory lock` (another migration run holds the
  database: wait for it, then deploy again) and
  `Migrations changed after they were applied to this database: <names>` (below).
- **Impact:** the deployment stops before the rollout, so the running version keeps serving.
  **Prisma does not wrap a migration in a transaction on PostgreSQL:** the statements before the
  failing one stay applied (verified with Prisma 7 on PostgreSQL 18). An expand migration leaves an
  extra table or column the running version ignores; a destructive statement can break it.
- **First checks:** which migration and which statement:
  `docker run --rm -e DATABASE_URL=<url> <api-migrate image>@<digest> node node_modules/prisma/build/index.js migrate status`.
  Compare the migration's statements with the database (`\d <table>` in `psql`) to see which ones
  took effect. Is the running version healthy?
- **Immediate actions:** do not roll out the new version. Never run `migrate dev` or `migrate reset`
  against the environment, and never edit `_prisma_migrations` by hand.
- **Mitigation**, in the database, then with the same image and `migrate resolve`:
  - the migration is right but the data was not ready (a `NOT NULL` on rows with nulls, a
    duplicate under a new unique index): undo the statements that took effect, fix the data, mark
    it rolled back (`migrate resolve --rolled-back <migration>`), and deploy the same release again;
  - the migration is wrong: undo what took effect, mark it rolled back, and ship a corrected
    migration in a new pull request (editing the failed file is acceptable only if it has not been
    applied in any environment);
  - finishing it by hand is the last resort: apply the remaining statements, then
    `migrate resolve --applied <migration>`. It is the only way when the failed migration had
    already added enum values without `IF NOT EXISTS` (the committed migrations before
    `TIGHTENING_FROM` in `scripts/check-migrations.mjs` do): PostgreSQL cannot drop them, and
    running the migration again stops at `enum label ... already exists`;
  - `Migrations changed after they were applied to this database`: nothing ran; a migration
    applied here was edited since ([database.md](database.md#migrations)). Put the file back as it
    was applied (`git log -p -- apps/api/prisma/migrations/<name>/migration.sql` shows its
    versions), ship the change as a new migration, and deploy again. Never update the checksum in
    `_prisma_migrations` to get past it: this database would keep a schema the new code does not
    expect.
- **Roll back when:** the partial migration broke the running version: repair the schema by hand
  first; if data was destroyed, restore ([disaster-recovery.md](disaster-recovery.md)).
- **Recovered when:** `migrate status` says `Database schema is up to date!` and the deployment
  completed.
- **Validate after:** the smoke test; the tables the migration touched hold what they should.
- **Document:** the statement, why the rehearsal did not catch it.
- **Prevention** ([database.md](database.md#migrations)): small migrations, `SET lock_timeout` at
  their top, and a rehearsal against a restored copy of production before releasing anything that
  rewrites data or locks large tables.

### 11. Authentication or security attack

- **Symptoms:** `Refresh token reuse for user <id> (at refresh|logout)` (a stolen refresh token
  was replayed: that session family is already revoked); bursts of 401 and 429 on
  `/api/auth/sign-in` (credential stuffing, from one address or many); bursts of 403
  `Cross-origin request refused` (forged cross-site requests); reports through `SECURITY.md`; a
  leaked secret; a lost or stolen phone reported by its owner.
- **Impact:** account takeover, data exposure, or availability (floods).
- **First checks:** one user or many; the `ip` field of the access log (all requests from the
  proxy's address means `TRUST_PROXY` is wrong, and then the rate limit throttles everyone
  together); which secret could be exposed and since when.
- **Immediate actions:**
  - stolen session or lost phone: a replayed token revokes its family automatically; to end every
    session of a user (every device), revoke their rows under the user's row lock, the way the API
    changes sessions (a refresh in flight would otherwise commit a new token after a plain
    `UPDATE`, and that token keeps working):

    ```sql
    BEGIN;
    SELECT id FROM users WHERE id = '<id>' FOR UPDATE;
    UPDATE sessions SET revoked_at = now() WHERE user_id = '<id>' AND revoked_at IS NULL;
    COMMIT;
    ```

    Their access tokens still work until they expire, within 15 minutes; the app then gets a 401
    on renewal and signs out;

  - credential stuffing: block at the edge (WAF, IP reputation); sign-in limits count per account
    and per address, and with several API instances the shared store (`RATE_LIMIT_STORE=redis`)
    makes them hold across instances ([security.md](security.md#rate-limiting));
  - leaked `JWT_ACCESS_SECRET`: rotate it without a previous value
    ([security.md](security.md#secret-rotation)): every access token is refused at once, and the
    apps renew theirs with their refresh tokens; leaked database or Redis credentials: rotate them;
  - a leaked EAS, store or Sentry credential: revoke it at the provider and replace the
    repository secret ([releases.md](releases.md#store-and-service-credentials)).
- **Mitigation:** fix the weakness; MFA or CAPTCHA if credential stuffing persists
  ([security.md](security.md#known-limits)).
- **Roll back when:** a deployment introduced the weakness.
- **Recovered when:** the signals are back to their baseline and every exposed secret is rotated.
- **Validate after:** the old secret no longer works; affected users are signed out.
- **Document:** indicators, affected accounts and data, every action with its time. **Preserve
  evidence first**: export the relevant logs before their retention expires; do not redeploy over
  a compromised host before capturing it. Personal data breaches can carry legal deadlines for
  notification (REQUIERE CONFIGURACIÓN: who decides and how fast).

### 12. External dependency outage

- **Alerts:** `ApiDependencyFailing` (`dependency_name` label).
- **Symptoms:** 502 (`An upstream service failed`) or 504
  (`An upstream service did not answer in time`) on the routes that call a provider; 5xx lines
  ending `dependency: <name>)`; warnings from the `External:<name>` logger
  (`METHOD /path <status|timeout|network_error> <ms>ms attempts=<n>`);
  `app_dependency_duration_seconds_count{outcome!="success"}` per `dependency_name`.
- **Impact:** the features that need the provider; everything else works.
- **First checks:** the provider's status page; one provider or all (all: egress, DNS or proxy on
  our side); 401 or 403 from the provider means our credentials expired or were revoked; 429 means
  we exceed its quota (the client honors `Retry-After`).
- **Immediate actions:** none in the application (no restart helps); tell users what does not work.
- **Mitigation:** rotate expired credentials; contact the provider's support (contacts table);
  disable or queue the feature if the outage lasts (project-specific).
- **Roll back when:** a deployment changed the integration.
- **Recovered when:** the success ratio of that dependency is back to its baseline.
- **Validate after:** a real call through the feature.
- **Document:** provider, duration, failed operations to replay, whether timeouts and retries
  behaved ([observability.md](observability.md#external-services)).

### 13. Sentry critical error spike

- **Symptoms:** a Sentry alert of the API's project: a new issue in production, a regression, an
  issue's frequency jump. The app's project: [17](#17-a-bad-app-release-or-ota-update).
- **Impact:** read it from the issue: users affected, routes (`http.route`), release.
- **First checks:** the release where it was first seen; `error.origin`; the `request_id` tag →
  the log line with the stack → the trace. Compare with the 5xx metrics: Sentry samples
  (`SENTRY_SAMPLE_RATE`) and can drop events at its quota, the metrics do not.
- **Immediate actions:** new in the latest release and user-facing: roll back. Otherwise fix
  forward with priority.
- **Mitigation:** without Sentry (not configured), the same information is in the error log lines.
- **Roll back when:** it is new in the release just deployed and affects a critical flow.
- **Recovered when:** no new events in the fixed release for 24 hours; the issue resolved.
- **Validate after:** the regression test that reproduces it passes.
- **Document:** the issue link, its cause, why tests missed it.

### 14. Data corruption or suspected data loss

- **Symptoms:** users report missing or wrong data; a migration, backfill, job or manual query
  wrote what it should not; PostgreSQL reports `invalid page in block` or `could not read block`
  (physical corruption).
- **Impact:** potentially permanent; possibly a personal data incident.
- **First checks:** who is writing the bad data (a release, a route, a job, a migration, a
  person) and since when: logs by route and release, `created_at` and `updated_at` of the damaged
  rows.
- **Immediate actions:** stop the writer: roll back the release, disable the job, revoke the
  operator's access. Freeze deployments. **Take a backup or snapshot of the current state now**:
  it is the evidence and it holds the good data written since the damage. Never repair production
  with a script that was not run on a copy first.
- **Mitigation:** restore a copy at the moment just before the first bad write into a separate
  database ([disaster-recovery.md](disaster-recovery.md#restore-procedure)), then repair: copy
  back only the damaged rows when the damage is identifiable (keeps everything written since);
  restore the whole database to that point only when the damage is widespread and the product
  owner accepts losing the writes since then.
- **Roll back when:** a release or job is the writer (immediately).
- **Recovered when:** the data is verified by its owners and the writer is fixed.
- **Validate after:** the checks of [disaster-recovery.md](disaster-recovery.md#restore-testing)
  on the repaired tables.
- **Document:** affected records and users, the window of lost or wrong data, the notification
  decision (REQUIERE CONFIGURACIÓN: data protection obligations).

### 15. Installed apps refused as outdated

- **Alerts:** `ApiClientsRefusedAsOutdated` (`app_platform` label).
- **Symptoms:** a large share of the API's requests answered 426
  (`This version of the app is no longer supported: update it to continue`); users of one
  platform report that the app only shows "Update the app", and that the store offers no update;
  `app_client_outdated_total` rising for that platform ("API service" → Installed apps).
- **Impact:** every install of that platform older than its minimum sees only the update screen.
  When the minimum is above the version the store offers, that is every user of the platform,
  new installs included: an outage for them (SEV1 or SEV2, by the platform's share).
- **First checks:** the API's `MOBILE_MIN_VERSION_IOS` and `MOBILE_MIN_VERSION_ANDROID` (a recent
  configuration change or deployment?) against the version live in each store (App Store Connect,
  Play Console: the version name people get today, not the one in review or in a staged rollout);
  a typo (`2.10.0` for `2.1.0`). Right after a deliberate raise for a version at 100 % in its
  store, a share that fades as people update is expected
  ([releases.md](releases.md#minimum-supported-version)).
- **Signals:** `app_client_outdated_total` by `app_platform`; the share of 426 among the API's
  responses; the app's update screen in support reports.
- **Immediate actions:** a minimum above what the store offers: lower it (or unset it) in the
  API's configuration and redeploy or restart the API ([deploy-vps.md](deploy-vps.md#change-a-setting-or-a-secret));
  the apps get through at their next request, nothing to do on the phones.
- **Mitigation:** raise a minimum only once that version is at 100 % in its store and has been for
  a few days; staging first, with the stack (`STACK_MOBILE_MIN_VERSION_*`).
- **Roll back when:** the minimum changed with the deployment or configuration change that
  started it.
- **Recovered when:** the share of refused requests is back to its baseline and the platform's
  traffic has recovered.
- **Validate after:** the current store version of the app, on a device, reaches its home screen;
  an older build gets the update screen only if it is meant to.
- **Document:** who changed which minimum, the version the store offered, the time users were
  locked out, and how the change is reviewed from now on.

### 16. Email not delivered

- **Alerts:** `ApiMailBacklog` (messages wait more than 15 minutes), `ApiMailDeliveryFailed`
  (`mail_kind` label: messages given up on).
- **Symptoms:** users do not receive password resets, sign-up confirmations, invitations or email
  change links; readiness `checks.mail: "degraded"` (200, the instance still serves); in the log
  `Could not send <kind> message <id> (attempt n): <category>; retrying in <s> s`,
  `Gave up on <kind> message <id>: <category>`, or `Mail worker paused: <reason>` (the database);
  `app_mail_outbox_oldest_age_seconds` rising, `app_mail_deliveries_total{outcome="retry"}` rising
  without `outcome="sent"`. A refused configuration also reaches the error tracker as
  `SMTP refused the configuration (<category>)` (`dependency: smtp`).
- **Impact:** degraded, not down: nothing is lost, the outbox keeps every message
  ([architecture.md](architecture.md#email)) and retries with backoff, but links arrive late, and
  a message that waits longer than its kind's validity (30 minutes for a password reset) is
  dropped unsent (`expired`): the person asks again in the app once email works. Sign-in and every
  other feature work.
- **First checks:** `pnpm --filter api mail status` (in a deployment:
  `docker compose ... run --rm -T api node dist/infrastructure/mail/mail.cli.js status`): counts
  by status and kind, the age of the oldest waiting message, the latest failures and their
  category. The category says where to look: `connection`, `timeout`, `dns` (the server or the
  network), `auth`, `smtp_5xx_535` (credentials refused: rotated, expired, wrong
  `MAIL_SMTP_URL`), `tls` (the server does not offer STARTTLS, which production requires),
  `smtp_4xx_*` (the provider defers: rate limits, a sending quota), `smtp_5xx_*` (the provider
  refuses this message: a bad address, the sender's domain not verified, a suppression list).
  The provider's status page and its own logs for the same minutes.
- **Signals:** `app_mail_outbox_waiting`, `app_mail_outbox_oldest_age_seconds`,
  `app_mail_deliveries_total` by `outcome`, `app_mail_delivery_duration_seconds` (a slow server),
  `app_mail_suppressed_total` (per-address limits: one address asked repeatedly).
- **Immediate actions:** none needed for a transient outage: every instance retries on its own
  (30 s, then doubling to an hour, with jitter). If no message moves at all, check that an API
  instance runs: the workers live in the API.
- **Mitigation:** credentials: rotate them at the provider and update `MAIL_SMTP_URL`
  (percent-encode the password; [environment.md](environment.md#api-variables)), then redeploy;
  waiting messages go out with their next attempt. A sender refused for domain authentication: fix
  SPF, DKIM and DMARC at the DNS. A provider down for long: switch `MAIL_SMTP_URL` to a second
  provider. Messages given up on (`failed`): once the cause is fixed, `mail retry --failed` (or
  `--id <id>`, `--kind <kind>`) queues them again, with their attempts started again; their address is kept for 7 days, after which
  they cannot be retried.
- **Roll back when:** a deployment changed `MAIL_SMTP_URL`, `MAIL_FROM`, `APP_ORIGIN` or
  `APP_BASE_PATH`.
- **Recovered when:** `Sent <kind> message <id>` lines again; readiness `checks.mail: "ok"`;
  `app_mail_outbox_oldest_age_seconds` back under a minute; `mail status` shows nothing waiting
  for long.
- **Validate after:** `pnpm --filter api mail test --to <your address>` delivers; a password reset
  asked from the app arrives and its link opens the app ([18](#18-app-links-open-the-browser));
  no new `failed` messages. Delivery is at least once: a worker that died after the server
  accepted a message and before recording it sends it again when its lease ends (2 minutes), so a
  few people may get a duplicate (with the same `Message-ID`); nothing to do about it.
- **Document:** duration, the category, how many messages were delayed, dropped (`expired`) or
  retried by hand, and what would have told you sooner.

### 17. A bad app release or OTA update

- **Alerts:** the app's Sentry project (REQUIERE CONFIGURACIÓN: an alert on new issues and on the
  crash-free rate of the newest release); Play Console's Android vitals and App Store Connect's
  crash reports; `eas update:insights` for an update.
- **Symptoms:** a crash or error spike in the app's Sentry project for one release, build or
  `update.id`; store vitals dropping after a rollout step; users reporting the app closing, a
  blank screen or a flow that stopped working, on one platform or both; the API's own signals
  calm (its errors would be [5](#5-high-5xx-rate)).
- **Impact:** every user who got that build or update: a crash at launch locks them out until a
  fix reaches their phone.
- **First checks:** what the spike has in common: the release and build (a store release), the
  `update.id` and channel (an OTA update), the platform, the OS version. Which share of users has
  it (the store's rollout percentage, the update's rollout percentage). The issue's breadcrumbs:
  failed calls carry the API's request ids ([observability.md](observability.md#the-app)), so a
  crash that follows an API answer leads to the API's log line.
- **Immediate actions** ([releases.md](releases.md#rollback)):
  - an OTA update: run the **EAS rollback** workflow, `earlier-update` with the group id of the
    last good update (or `embedded` to go back to the bundle the build shipped with); users get it
    at their next launch. Still in a partial rollout: `eas update:revert-update-rollout` is faster;
  - a store release: halt the Play staged rollout and pause the App Store phased release; stores
    have no rollback.
- **Mitigation:** a JavaScript fix ships as an OTA update to that build's runtime version, through
  the EAS update workflow; a native fix needs a new build and store review (expedited on iOS if
  needed). Old builds that can no longer work against the API: the minimum supported version, once
  a fixed version is live in the store ([15](#15-installed-apps-refused-as-outdated)).
- **Roll back when:** the spike started with an update or a rollout step (immediately).
- **Recovered when:** the crash-free rate of the newest release and update is back to its baseline
  for 24 hours.
- **Validate after:** the fixed build or update on a device of the affected platform; the Maestro
  flows of the critical journeys (`pnpm test:e2e:mobile`) against it.
- **Document:** the build or update, the share of users reached before the halt, the cause, and
  which gate (tests, preview, internal testing, staged rollout) should have caught it.

### 18. App links open the browser

- **Symptoms:** links in emails (`https://<domain>/app/...`) and shared links open the open-in-app
  page in the browser on phones that have the app; users report that a password reset or an
  invitation "does nothing"; `pnpm smoke --url <public URL> --require-app-links` fails.
- **Impact:** degraded, not down: the open-in-app page explains how to open the link, but every
  emailed flow (password reset, sign-up confirmation, invitation, email change) takes extra steps
  or is abandoned.
- **First checks:** the link files: `curl -i https://<domain>/.well-known/apple-app-site-association`
  and `.../.well-known/assetlinks.json` must answer 200 JSON with no redirect, claiming `/app/*`
  for the production app. A 404 means the web image's identity variables are unset (`web.env`,
  [environment.md](environment.md#web-variables)); a wrong fingerprint is common after turning on
  Play App Signing (the fingerprint of Google's signing key, not the upload key, is the one that
  counts). Android: `adb shell pm get-app-links <package>` says whether the domain was verified.
  Apple caches the file through its CDN: a fix can take a day to reach the phones.
- **Immediate actions:** correct the identity in `web.env` and restart the web container
  ([deploy-vps.md](deploy-vps.md#change-a-setting-or-a-secret)); never put a redirect in front of
  `/.well-known/` (the edge forwards it as it came: `deploy/vps/Caddyfile`).
- **Mitigation:** on Android, a reinstall or `adb shell pm verify-app-links --re-verify <package>`
  verifies the domain again; on iOS, the app checks again when it is installed or updated.
- **Roll back when:** a deployment of the web image or a change of its settings started it.
- **Recovered when:** `pnpm smoke --url <public URL> --require-app-links` passes and an emailed
  link opens the app on both platforms.
- **Validate after:** a password reset asked from the app, its link opened on an Android phone and
  an iPhone with the production app installed.
- **Document:** what changed (identity, certificate, domain), how long links opened the browser,
  and the check that would have caught it before release.

### 19. Push notifications not delivered

- **Alerts:** `ApiPushBacklog` (notifications wait more than 15 minutes), `ApiPushDeliveryFailed`
  (`push_kind` label: notifications given up on). Dead tokens (`outcome="unregistered"`: apps
  uninstalled) are normal and do not alert.
- **Symptoms:** phones do not get the security notice of a changed password (or a product's own
  kinds); readiness `checks.push: "degraded"` (200, the instance still serves); in the log
  `Could not send <kind> notification <id> (attempt n): <category>; retrying in <s> s`,
  `Gave up on <kind> notification <id> (attempt n): <category>`,
  `Push <kind> notification <id> refused: <code>`, `Could not read <n> push receipts`, or
  `Push worker paused: <reason>` (the database); `app_push_outbox_oldest_age_seconds` rising,
  `app_push_deliveries_total{outcome="retry"}` rising without `outcome="sent"`. Refused credentials
  also reach the error tracker as `Push service refused the configuration (<code>)`
  (`dependency: expo-push`).
- **Impact:** degraded, not down. Nothing is lost while it waits: the outbox keeps every
  notification ([architecture.md](architecture.md#push-notifications)) and retries with backoff,
  but one that waits past its kind's validity (a day for `password_changed`) is dropped unsent
  (`expired`). The email notice goes out regardless; sign-in and every other feature work.
- **First checks:** `pnpm --filter api push status` (in a deployment:
  `docker compose ... run --rm -T api node dist/infrastructure/push/push.cli.js status`): whether
  push is on, counts by status and kind, the age of the oldest waiting notification, the devices
  and the latest failures with their category. The category says where to look: `timeout`,
  `network` or `http_5xx` (Expo's service: [status.expo.dev](https://status.expo.dev)), `http_401`
  or `http_403` (`EXPO_ACCESS_TOKEN` refused: revoked, or enhanced security turned on without it),
  `http_429` or `MessageRateExceeded` (too many at once: they are retried),
  `InvalidCredentials` or `MismatchSenderId` (the FCM V1 key or the APNs key of the EAS project is
  missing, expired or for another app: Android or iOS notifications fail for everyone),
  `MessageTooBig` (a template's payload: a bug), `malformed_response` (the service answered
  something unexpected), `no_receipt` (Expo never had its receipt: sent, its fate unknown).
- **Signals:** `app_push_outbox_waiting`, `app_push_outbox_oldest_age_seconds`,
  `app_push_deliveries_total` by `outcome` (`sent`, `delivered`, `retry`, `failed`,
  `unregistered`, `expired`), `app_push_devices_disabled_total`; "API service" → Push
  notifications.
- **Immediate actions:** none needed for a transient outage of the push service: every instance
  retries on its own (30 s, then doubling to an hour, with jitter). If nothing moves at all, check
  that an API instance runs with `PUSH_ENABLED` set: the workers live in the API.
- **Mitigation:** credentials: upload a valid FCM V1 key or APNs key to the EAS project
  (`eas credentials`), or rotate `EXPO_ACCESS_TOKEN` at expo.dev and redeploy the API
  ([environment.md](environment.md#api-variables)); waiting notifications go out with their next
  attempt. Notifications given up on (`failed`) are not sent again: a security notice that late is
  noise, and its email went out. A template bug: fix it and deploy.
- **Roll back when:** a deployment changed `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` or a push template,
  or a new app build changed the EAS project or its credentials.
- **Recovered when:** `app_push_deliveries_total{outcome="sent"}` and, 15 minutes later,
  `outcome="delivered"` rise again; readiness `checks.push: "ok"`;
  `app_push_outbox_oldest_age_seconds` back under a minute.
- **Validate after:** on a real phone with the release build, signed in with notifications
  allowed, change the password of a test account: the notice arrives and its tap opens Settings.
  Delivery is at least once: a worker that died after the service accepted a notification and
  before recording it sends it again when its lease ends (a minute).
- **Document:** duration, the category, how many notifications were delayed, dropped (`expired`) or
  given up on, and what would have told you sooner.

## After the incident

Within a few working days, a blameless postmortem for every SEV1 and SEV2, and for any incident
that spent more than 20 % of an error budget ([alerting.md](alerting.md#error-budget)):

```
Summary          one paragraph: what users saw, how long
Impact           users, requests or data affected; error budget spent
Timeline         first failure, detection, acknowledgement, mitigation, recovery (with times)
Root cause       and the conditions that let it happen
Detection        which alert fired first; if none, which one should have
What went well   and what did not
Action items     each with an owner and a date: tests, alerts, runbooks, limits
```

Update this page when a runbook was wrong or missing, and [alerting.md](alerting.md) when an alert
fired late, never, or for nothing.
