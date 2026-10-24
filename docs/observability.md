# Observability

What the API tells you about itself, what is on by default, what each project turns on, and how
the signals answer the questions of an incident. The app reports its own crashes and errors
([mobile-architecture.md](mobile-architecture.md#observability)); [The app](#the-app) says how a
report from a phone leads to the API's logs. The dashboards, the SLOs and the alert rules ship as
code in `observability/`, checked in CI and tied to no vendor
([Dashboards and alerts as code](#dashboards-and-alerts-as-code)); loading them into a backend and
routing their notifications is each project's.

## What is included

| Capability                                                                                 | Class                  | On by default | Needs                                                                          |
| ------------------------------------------------------------------------------------------ | ---------------------- | ------------- | ------------------------------------------------------------------------------ |
| Structured logs (JSON in production) with automatic redaction                              | CORE                   | yes           | nothing                                                                        |
| Request ids on every response, log line, error report and outgoing call                    | CORE                   | yes           | nothing                                                                        |
| Deployment identity (environment, release) on every log line and report                    | CORE                   | yes           | the image build (release) and `APP_ENVIRONMENT`                                |
| Liveness and readiness probes (database, Redis when configured, email, push)               | CORE                   | yes           | nothing                                                                        |
| Graceful shutdown (drain, close, flush)                                                    | CORE                   | yes           | nothing                                                                        |
| Error classification (application, database, dependency, unavailable) and the error metric | CORE                   | yes           | nothing                                                                        |
| Slow query log (statement only)                                                            | CORE                   | yes (500 ms)  | nothing                                                                        |
| Shared client for external services (timeouts, retries, correlation)                       | CORE                   | yes           | nothing                                                                        |
| Metric catalog checked against the code (`observability/api-metrics.json`)                 | CORE                   | yes           | nothing                                                                        |
| Dashboards, SLOs and alert rules as code, with unit tests (`observability/`)               | CORE                   | yes (checked) | a Prometheus-compatible backend to load them                                   |
| Error tracking of the API (Sentry)                                                         | OPTIONAL               | no            | REQUIRES CONFIGURATION: a Sentry project                                       |
| Tracing and metrics (OpenTelemetry, OTLP)                                                  | OPTIONAL               | no            | REQUIRES CONFIGURATION: a collector or provider                                |
| Crash and error reporting of the app (Sentry for React Native)                             | OPTIONAL               | no            | REQUIRES CONFIGURATION: a Sentry project ([The app](#the-app))                 |
| Local observability backend (Grafana, Prometheus, Tempo, Loki)                             | OPTIONAL (development) | no            | Docker                                                                         |
| Uptime monitoring                                                                          | REQUIRES CONFIGURATION | no            | an external uptime service                                                     |
| Loading the dashboards and rules, and alert routing                                        | REQUIRES CONFIGURATION | no            | the chosen backend ([Use them with your backend](#use-them-with-your-backend)) |

Nothing optional is needed to run, test or deploy the template: without `SENTRY_DSN` and
`OTEL_EXPORTER_OTLP_ENDPOINT` the API does not even load the SDKs, and without
`EXPO_PUBLIC_SENTRY_DSN` the app's reporter stays disabled.

## Questions an incident asks

| Question                                             | Answered by                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is the API failing?                                  | Uptime checks and readiness; 5xx rate (`app.server.errors`, `http.server.request.duration` by status); new issues in the API's Sentry project                                                          |
| When did it start?                                   | The metric's time series; the issue's first-seen time in Sentry                                                                                                                                        |
| How many users does it affect?                       | Sentry's users per issue (opaque user ids); share of requests failing; distinct `userId` on the access lines of failing requests                                                                       |
| Which endpoint is failing?                           | `http.route` on metrics, spans and error reports; the path in the error log line (`GET /api/items/7 -> 500`)                                                                                           |
| Which version introduced it?                         | API: `release` (the commit SHA) on every log line, error report and span; Sentry's "first seen in release"; compare by `service.version`. App: the release, build and `update.id` of its Sentry events |
| Where exactly?                                       | The stack trace (Sentry, error log line); the trace's spans: route, Express handler, query, outgoing call                                                                                              |
| Application, database, infrastructure or dependency? | `error.origin` (`application`, `database`, `dependency`, `unavailable`) on the error metric, log line and report; readiness checks; pool and dependency metrics                                        |
| Isolated error or regression?                        | Sentry issue frequency and its release; error rate before and after a deployment (`service.version`)                                                                                                   |
| The app or the API?                                  | The app's Sentry event: its network breadcrumbs carry the `requestId` of failed calls (5xx, timeout, no network); the API's log lines and error report for that id ([The app](#the-app))               |

## Identity

Every JSON log line, error report and span says which deployment and build produced it:

- `service` (`OTEL_SERVICE_NAME`, default `api`);
- `environment` (`APP_ENVIRONMENT`, default `NODE_ENV`): set `staging` or `production`, both run
  `NODE_ENV=production`; the local stack (`docker compose --profile stack up --build`) sets
  `stack`;
- `release` (`APP_RELEASE`): the images are built with the commit SHA
  (`.github/workflows/docker-images.yml`, the `APP_RELEASE` build argument of
  `apps/api/Dockerfile`); the local stack builds with the root `.env`'s `APP_RELEASE`, `local` when
  unset; `unversioned` when nothing set it (local runs).

At boot the API logs them, and what is switched on: `Starting release <release> in
<environment>: tracing and metrics on|off, error tracking on|off, Redis on|off, email on|off, push on|off`.

Spans and metrics also carry `service.instance.id`, a random id per process (the `instance` label
in Prometheus), and nothing about the machine: no host name (a container's id, or on a developer's
computer often the person's name) and no machine id. To name the server, set
`OTEL_RESOURCE_ATTRIBUTES=host.name=<name>`.

## Logs

- One logger for the API (`apps/api/src/common/logging/logger.ts`, Nest's `ConsoleLogger`
  extended): **JSON lines in production**
  (`{"level","pid","timestamp","message","context","service","environment","release","requestId","traceId","spanId"}`),
  readable text in development. `LOG_LEVEL` sets the minimum level; `LOG_FORMAT` overrides the
  format.
- **Redaction, automatic** (`apps/api/src/observability/redact.ts`): every message, object, error
  and stack trace is masked before it is printed: values under sensitive keys (`password`, `token`,
  `authorization`, `cookie`, `apiKey`, `secret`...), and credentials written inline in strings
  (connection strings, bearer tokens, JWTs, `token=` in URLs, private keys, well-known provider
  tokens). A secret handed to the logger by mistake comes out as `[REDACTED]`
  ([security.md](security.md#logging)).
- **Correlation:** a line written while serving a request carries its `requestId` (and the
  `traceId`/`spanId` when tracing is on), wherever in the code it was written. Text lines show
  `(req <id>)`.
- Use `new Logger(ClassName.name)`; never `console.log` in application code (lint rule).
- **Access log:** one line per request with `requestId`, method, path, status, `durationMs`, the
  client `ip` and the `userId` when a guard identified one
  (`apps/api/src/common/logging/request-context.middleware.ts`), written when the response is sent
  (`request completed`). `ip` is the address Express resolves through `TRUST_PROXY`; phones behind
  a carrier's NAT share public addresses, so an address is not a user. Health probes log at
  `debug`. A request whose connection closes first (the app or a proxy gave up, a shutdown cut it)
  gets its one line then: `request aborted` with `aborted: true` (`aborted` after the duration in
  text lines), the time until the connection closed, and the status only if the response had
  started (`statusCode: null` otherwise, `-` in text lines). Many of them on one route point at a
  slow dependency behind it.
- **Never logged:** headers, tokens (access or refresh: the refresh token travels in the request
  body), request or response bodies, query strings, passwords, environment values. Log identifiers
  (user id, record id, request id), not personal data. Errors that services catch and log
  themselves (the email outbox, the one-time token sweep, queuing a message) name a database error
  by its class and code only (`apps/api/src/common/logging/error-summary.ts`): Prisma's messages
  can quote a query's arguments.
- **Errors:** every 5xx is logged once by the error filter with the stack, the request id and its
  origin: `GET /api/items/7 -> 502 (request 0190..., dependency: billing)`. 4xx are normal client
  behavior and not logged as errors ([error-handling.md](error-handling.md)).
- Logs go to stdout/stderr; the platform collects them (REQUIRES CONFIGURATION: retention, access,
  search).

## Request ids

Every response carries `X-Request-Id`. An incoming id (from the app, a proxy or another service) is
kept if it is well formed (1 to 128 letters, digits, `.`, `_` or `-`), otherwise replaced with a
random UUID, so the header can never inject text into the logs. The app sends one of its own on
every request, so the app and the API know a request by the same id ([The app](#the-app)). The id
is also attached to the request's span (`app.request_id`), to its error reports (`request_id` tag)
and to outgoing calls made through the external HTTP client (`X-Request-Id` header). Bug reports
ask for it (`.github/ISSUE_TEMPLATE/bug_report.yml`).

## Health checks

| Endpoint                | Meaning                               | Used by                                                                                  |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/health/live`  | the process serves requests           | the image's `HEALTHCHECK` (`apps/api/Dockerfile`), restart policies, `pnpm dev`'s banner |
| `GET /api/health/ready` | hard dependencies reachable, else 503 | orchestrator readiness and load balancers (REQUIRES CONFIGURATION), `pnpm dev`'s banner  |

Readiness answers `{ status, checks: { database, redis, mail } }`:

- the database is always a hard dependency: unreachable → 503;
- Redis is checked only when configured: `disabled` without `REDIS_URL`; when it is down
  (`unavailable`), `status: "degraded"` with 200 (features fall back,
  [architecture.md](architecture.md#degradation)), or 503 with `REDIS_REQUIRED=true`;
- email (`mail`) never fails the probe: `disabled` without `MAIL_SMTP_URL`, `degraded` (with 200,
  and `status: "degraded"`) while the latest deliveries fail for a reason that is not the message's
  own (connection, timeout, credentials) or the oldest waiting message is older than 15 minutes;
  the state is the worker's last reading, so the check does no I/O
  ([architecture.md](architecture.md#email));
- push notifications (`push`) never fail the probe either: `disabled` without `PUSH_ENABLED`,
  `degraded` (with 200, and `status: "degraded"`) for 15 minutes after a send failed for a reason
  that is not the notification's own (the push service down, its access token refused) or while
  the oldest waiting notification is older than 15 minutes; the worker's last reading too
  ([architecture.md](architecture.md#push-notifications));
- during shutdown it answers 503 at once, so no new traffic is routed to the instance.

Probes are exempt from rate limiting and from the minimum app version check, never require
authentication, and are not traced. No proxy ships with this repository: whatever publishes the API
(REQUIRES CONFIGURATION) should answer `/api/health/` (in any letter case) only on the private
network, and the orchestrator calls the probes on the API itself, so the public cannot read
dependency status or make the API query the database at will. Add every new hard dependency to the
readiness check.

Readiness answers within 2.5 seconds whatever its dependencies do: the database and Redis are
checked at once, and a check that has not answered by then counts as unreachable (503 for the
database, `degraded` for an optional Redis). Requests are bounded too: the pool waits at most 5
seconds for a connection, the database cancels a statement after `DB_STATEMENT_TIMEOUT_MS` (30 s)
and the driver gives up 5 seconds later, and each Redis command waits at most
`REDIS_COMMAND_TIMEOUT_MS` (a stalled Redis is then skipped for a few seconds:
[architecture.md](architecture.md#redis)). An unreachable or stalled dependency fails requests and
the readiness check instead of hanging them. An API started while the database is down boots
anyway, logs `Database unreachable at boot (<host>: <reason>)` and answers readiness with 503 until
the database answers.

## Graceful shutdown

On SIGTERM (`app.enableShutdownHooks()`, `apps/api/src/lifecycle/shutdown.ts`):

1. readiness starts answering 503 and the HTTP server stops accepting connections;
2. requests in flight finish (at most 10 seconds, then their connections are closed: each request
   cut leaves an access line marked aborted);
3. the modules close, one after the other: the email worker and the push worker (each stops
   claiming and waits up to 10 seconds for the message or the batch it is sending), database pool,
   Redis connection, timers;
4. buffered spans, metrics and error reports are flushed; the process exits.

Each step is logged (`Shutting down: refusing new connections, finishing requests in flight`,
`HTTP server closed`, `Redis connection closed`, `Shutdown complete (SIGTERM)`). Containers run
`node` directly (no shell wrapper), so the signal reaches it. Give the platform a termination grace
period above 15 seconds, plus 10 for an email and 10 for a batch of notifications that may be in
flight when the drain ends: 40 seconds on the server (`deploy/vps/compose.yaml`). One cut off is
sent again once its lease runs out.

An exception or rejected promise that nothing caught is logged at `fatal` with its stack, reported
to the error tracker (waiting at most 2 seconds for it to be sent) and the process exits
(`apps/api/src/main.ts`): the orchestrator restarts a clean process instead of serving from an
unknown state. `fatal` lines deserve an alert in whatever collects the logs.

## Error tracking

OPTIONAL, REQUIRES CONFIGURATION (a Sentry project, sentry.io or self-hosted). Off without a DSN:
errors are then only logged. This section is the API's; the app's reports:
[The app](#the-app).

**What is reported:**

| Source                                                                             | Reported |
| ---------------------------------------------------------------------------------- | -------- |
| Unexpected errors behind a 500 (bugs), database failures                           | yes      |
| Failing external services and Redis (`origin: dependency`), grouped per dependency | yes      |
| Uncaught exceptions and unhandled rejections (crashes, level `fatal`)              | yes      |
| 4xx, deliberate 503s (readiness, shutdown)                                         | no       |

**Metadata on each report:** environment, release, request id (`request_id`), method
(`http.method`), route pattern (`http.route`: `/api/items/:id`), status code
(`http.status_code`), error origin and dependency (`error.origin`, `dependency.name`), an opaque
user id. Nothing else.

**Never sent** ([security.md](security.md#error-tracking-data)): passwords, tokens, cookies,
`Authorization` headers, request and response bodies, query strings, local variables, breadcrumbs,
console output. The SDK's own data collection is switched off category by category
(`DATA_COLLECTION` in `apps/api/src/observability/sentry.ts`), and every event is scrubbed again
before it leaves (`scrubEvent`), with the same redaction as the logs.

**Setup:**

1. Create two Sentry projects: one Node.js (API), one React Native (app). Separate projects keep
   their quotas and permissions apart.
2. API: `SENTRY_DSN` (and optionally `SENTRY_SAMPLE_RATE`), from the platform's secret store.
3. Set `APP_ENVIRONMENT`, and deploy images built by `.github/workflows/docker-images.yml` (the
   release is baked in).
4. App: `EXPO_PUBLIC_SENTRY_DSN` is an EAS environment variable, and `EXPO_PUBLIC_APP_ENV`
   (`development`, `staging`, `production`) is set per build profile in `apps/mobile/eas.json`
   ([releases.md](releases.md#environment-variables)); give `APP_ENVIRONMENT` the same names so
   both projects filter alike.

| Environment | API                                                                 |
| ----------- | ------------------------------------------------------------------- |
| development | unset (errors in the console); or a dev project's DSN               |
| test / CI   | unset: no account needed, nothing sent                              |
| staging     | the project's DSN, `APP_ENVIRONMENT=staging`                        |
| production  | the same DSN, `APP_ENVIRONMENT=production`; https only (boot check) |

Use the same project for staging and production and filter by environment; alert rules should
target production. To check a configuration without a real failure, stop the database briefly in
staging and call an authenticated route: one `database` issue appears, with the request id.

Implementation: the API builds its client on `@sentry/core` (the base of every Sentry SDK), not
`@sentry/node`, which brings its own OpenTelemetry setup and a CLI under a non-OSI license
([ADR 0004](adr/0004-observability-and-optional-infrastructure.md)).

## OpenTelemetry

OPTIONAL. On when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (and `OTEL_SDK_DISABLED` is not `true`);
off, the SDK is never imported and nothing is patched, so development and tests pay no overhead.

**What it generates:**

| Signal                        | Instrumentation                         | Data                                                                                                       |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Server spans + request metric | HTTP (`instrumentation-http`)           | one span per request; `http.server.request.duration` (method, route, status)                               |
| Route spans                   | Express                                 | the route pattern of each request (`GET /api/items/:id`) and its handler, also on the HTTP metrics         |
| Database spans + pool metrics | PostgreSQL (`instrumentation-pg`)       | one span per query (statement with placeholders, never values); connection pool usage and waiting requests |
| Client spans + client metric  | fetch (`instrumentation-undici`)        | outgoing calls; `http.client.request.duration`; W3C trace context injected                                 |
| Redis metrics                 | node-redis's own                        | command duration and errors, connections                                                                   |
| Runtime metrics               | Node.js runtime                         | event loop delay and utilization, heap, garbage collection                                                 |
| Process metrics               | built in                                | `process.cpu.time`, `process.memory.usage` (RSS)                                                           |
| Application metrics           | `apps/api/src/observability/metrics.ts` | see [Metrics](#metrics)                                                                                    |

NestJS handler spans are not included: the official instrumentation does not support Nest 12 yet
(add `@opentelemetry/instrumentation-nestjs-core` when it does). Nest 12 loads its HTTP platform
with `import()`, so the SDK also registers an in-thread ESM loader hook (`import-in-the-middle`)
limited to the instrumented modules (`http`, `https`, `express`, `pg`, `pg-pool`).

Health probes are never traced. Every span is checked before export (`RedactingSpanProcessor`):
query strings and URL credentials removed, a value under a sensitive name (`authorization`,
`cookie`, `password`, `token`...: the log redaction's list) masked whole, and every other string
attribute, string arrays included, redacted like log lines, on the span and on its events (an
exception event carries the error's message and stack trace), and so is its status message.

The telemetry's own requests (the OTLP exports, the error tracker's reports) are sent with tracing
suppressed and never counted in `http.client.request.duration`: the collector does not show up as
an external service.

**Where it goes:** OTLP over HTTP (JSON) to `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces` and
`/v1/metrics`, metrics every `OTEL_METRIC_EXPORT_INTERVAL` ms (default 60 s). Provider credentials
go in `OTEL_EXPORTER_OTLP_HEADERS` (for example `Authorization=Basic ...`), from the secret store;
the code never reads them. Traces are propagated with W3C `traceparent` to downstream services.

**Sampling:** every trace by default. In production set the standard variables, for example
`OTEL_TRACES_SAMPLER=parentbased_traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1` (10 % of new
traces, and whatever the caller decided for propagated ones). Metrics are not sampled.

**Connecting a collector or provider** (REQUIRES CONFIGURATION), two shapes, both standard OTLP:

```
API ──OTLP──► OpenTelemetry Collector ──► Prometheus / Mimir (metrics) ──► Grafana (dashboards, alerts)
                (sidecar or gateway)    └─► Tempo / Jaeger (traces)

API ──OTLP──► managed provider (Grafana Cloud, Honeycomb, Datadog, New Relic, Elastic, ...)
```

- Self-hosted: run an OpenTelemetry Collector next to the API
  (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` for a sidecar), with an `otlp` receiver and
  the exporters of your backends (`prometheusremotewrite`, `otlp` to Tempo). The collector is also
  where to add tail sampling, attribute filtering or a second destination without touching the
  application.
- Managed: point `OTEL_EXPORTER_OTLP_ENDPOINT` at the provider's OTLP/HTTP endpoint and put its key
  in `OTEL_EXPORTER_OTLP_HEADERS`. A provider that only accepts OTLP over gRPC or protobuf needs a
  collector in between.
- Logs stay on stdout (the platform ships them); the trace and span ids in each JSON line link them
  to traces in any backend that indexes them.

### Local backend

`docker compose --profile observability up -d` starts `grafana/otel-lgtm` (collector, Prometheus,
Tempo, Loki, Grafana in one image, development only), published on loopback: OTLP/HTTP on 4328,
Grafana on 3011, Prometheus on 9100, with the dashboards and rules of `observability/` mounted
read-only ([Dashboards and alerts as code](#dashboards-and-alerts-as-code)). Set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4328` in `apps/api/.env`, restart `pnpm dev`, use the
app against it (or send a few requests), and open Grafana at http://localhost:3011:

- Dashboards → Application: "API service" and "API SLOs";
- Alerting → Alert rules: the Prometheus rules, under data source-managed, evaluated every 30
  seconds (nothing is notified: routing is not configured locally);
- Explore → Prometheus for metrics (the series of the [metric catalog](#metric-catalog));
- Explore → Tempo for traces; a request id leads to its trace with the TraceQL query
  `{ span.app.request_id = "<id>" }`;
- Prometheus itself on http://localhost:9100.

Grafana reloads a changed dashboard file within 30 seconds; Prometheus reads the rule files when it
starts, so after changing them run `docker compose --profile observability restart otel-lgtm`. The
API pushes metrics every minute (`OTEL_METRIC_EXPORT_INTERVAL`): set 5000 locally to see panels
fill sooner. The production-like stack (`--profile stack`) sends to it with
`STACK_OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318` in the root `.env`. Never deploy this
service: its Grafana has anonymous admin access.

## Dashboards and alerts as code

The dashboards, the SLOs and the alert rules are files in `observability/`, reviewed and tested
like code, and tied to no vendor: Grafana dashboards that read any Prometheus-compatible data
source, and Prometheus rule files that Prometheus, Grafana Mimir and Grafana Cloud load unchanged.

| File                                                | What                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observability/grafana/dashboards/api-service.json` | "API service": rate, errors and latency per route, 5xx by origin, readiness, Node.js runtime, database, cache, Redis, external calls, degraded features, email, installed apps refused as outdated, push notifications |
| `observability/grafana/dashboards/api-slo.json`     | "API SLOs": objective, SLI and error budget over 30 days, burn rate per alert window, the SLO alerts                                                                                                                   |
| `observability/prometheus/rules/api-slo.yaml`       | the availability and latency SLOs: recording rules and multiwindow burn-rate alerts ([alerting.md](alerting.md#slis-and-slos))                                                                                         |
| `observability/prometheus/rules/api-alerts.yaml`    | symptom alerts ([below](#alerts))                                                                                                                                                                                      |
| `observability/prometheus/tests/*.test.yaml`        | unit tests of the rules with synthetic series (`promtool test rules`)                                                                                                                                                  |
| `observability/prometheus/prometheus.yaml`          | the local backend's Prometheus configuration, which loads the rules                                                                                                                                                    |
| `observability/grafana/dashboards.yaml`             | the local backend's dashboard provider (folder "Application")                                                                                                                                                          |
| `observability/api-metrics.json`                    | the series the API exports ([Metric catalog](#metric-catalog))                                                                                                                                                         |

**Rules of the files**, checked by `pnpm observability:check` (CI job "Observability as code";
needs Docker, and the part that does not also runs in `pnpm test:scripts`):

- every query reads its data source through the dashboard's `datasource` variable, never a fixed
  uid, so the same JSON imports into any Grafana; the other variables are `job`
  (`OTEL_SERVICE_NAME`) and `environment` (`APP_ENVIRONMENT`);
- every metric a dashboard or rule reads is in the catalog or written by a recording rule: a
  renamed metric fails the check instead of leaving an empty panel or an alert that never fires;
- every alert has a `severity` label (`critical` pages, `warning` goes to the team's channel), a
  `runbook_url` to a section of [incident-response.md](incident-response.md) that exists, the
  `dashboard_uid` to open first, a summary and a description, and a unit test that makes it fire;
- promtool, pinned in `scripts/tool-images/Dockerfile`, checks the configuration and the rules,
  parses every dashboard query (each one compiled into a recording rule) and runs the unit tests.

`runbook_url` is a path in this repository: make it a link in the notification template of your
routing (the repository's URL in front). The rules group by `job` and
`deployment_environment_name`, so two services, or staging and production, can share a backend
without mixing; that needs `deployment.environment.name` kept as a label (Prometheus:
`otlp.promote_resource_attributes`, as `observability/prometheus/prometheus.yaml` does), or one
backend per environment.

### Alerts

Thresholds are starting points ([alerting.md](alerting.md#alert-catalog)); a change comes with its
unit test.

| Alert                           | Severity | Fires when                                                                                                 | Runbook                                                                                              |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ApiAvailabilityBudgetFastBurn` | critical | 5xx burn rate above 14.4 over 1 hour and over 5 minutes, at least 100 requests in the hour                 | [5. High 5xx rate](incident-response.md#5-high-5xx-rate)                                             |
| `ApiAvailabilityBudgetSlowBurn` | warning  | burn rate above 6 over 6 hours and 30 minutes, or above 1 over 3 days and 6 hours                          | [5. High 5xx rate](incident-response.md#5-high-5xx-rate)                                             |
| `ApiLatencyBudgetFastBurn`      | critical | the same burn rates, counting responses slower than 500 ms (authentication excluded)                       | [6. High latency](incident-response.md#6-high-latency)                                               |
| `ApiLatencyBudgetSlowBurn`      | warning  | as the availability slow burn, for the latency SLO                                                         | [6. High latency](incident-response.md#6-high-latency)                                               |
| `ApiReadinessFailing`           | critical | an instance's readiness answered 503 in every 2-minute window for 2 minutes                                | [2. Readiness failing](incident-response.md#2-readiness-failing)                                     |
| `ApiDatabaseErrors`             | critical | 5xx with origin `database` for 2 minutes                                                                   | [3. Database unavailable](incident-response.md#3-database-unavailable)                               |
| `ApiRouteErrorRatioHigh`        | warning  | a route's 5xx above 5 % for 10 minutes, with at least 20 requests                                          | [5. High 5xx rate](incident-response.md#5-high-5xx-rate)                                             |
| `ApiRouteLatencyHigh`           | warning  | a route's p95 above 500 ms for 15 minutes (authentication excluded)                                        | [6. High latency](incident-response.md#6-high-latency)                                               |
| `ApiDegradedMode`               | warning  | a feature served by its fallback for 5 minutes (Redis or the cache store down)                             | [4. Redis unavailable](incident-response.md#4-redis-unavailable)                                     |
| `ApiDependencyFailing`          | warning  | over 5 % of a dependency's calls failing for 10 minutes, with at least 20 calls                            | [12. External dependency outage](incident-response.md#12-external-dependency-outage)                 |
| `ApiDatabasePoolSaturated`      | warning  | requests waiting for a database connection for 5 minutes                                                   | [6. High latency](incident-response.md#6-high-latency)                                               |
| `ApiEventLoopDelayHigh`         | warning  | event loop p99 above 200 ms for 15 minutes                                                                 | [7. Memory or CPU pressure](incident-response.md#7-memory-or-cpu-pressure)                           |
| `ApiMetricsAbsent`              | warning  | no metrics from the API for 10 minutes (the dead man's switch: every other alert is blind)                 | [1. API down](incident-response.md#1-api-down)                                                       |
| `ApiMailBacklog`                | warning  | the oldest message in the outbox has waited more than 15 minutes, for 10 minutes                           | [16. Email not delivered](incident-response.md#16-email-not-delivered)                               |
| `ApiMailDeliveryFailed`         | warning  | a message given up on (refused for good, or out of attempts) in the last 30 minutes                        | [16. Email not delivered](incident-response.md#16-email-not-delivered)                               |
| `ApiPushBacklog`                | warning  | the oldest notification in the push outbox has waited more than 15 minutes, for 10 minutes                 | [19. Push notifications not delivered](incident-response.md#19-push-notifications-not-delivered)     |
| `ApiPushDeliveryFailed`         | warning  | a notification given up on (refused for good, or out of attempts; not a dead token) in the last 30 minutes | [19. Push notifications not delivered](incident-response.md#19-push-notifications-not-delivered)     |
| `ApiClientsRefusedAsOutdated`   | warning  | over 20 % of the requests refused with 426 for one platform, at least 20 in 15 minutes, for 30 minutes     | [15. Installed apps refused as outdated](incident-response.md#15-installed-apps-refused-as-outdated) |

Health probes are not in the HTTP metrics: `ApiReadinessFailing` counts the 503s the error filter
records (`app_server_errors_total{error_origin="unavailable", http_route="/api/health/ready"}`),
so something must probe readiness (the orchestrator, or an internal uptime check). On the VPS
target nothing does between deployments: the container health check probes liveness, and the edge
answers 404 to `/api/health/` from outside. There, `ApiReadinessFailing` stays silent until an
internal check polls readiness; a database outage still shows as `ApiDatabaseErrors`, the SLO
alerts and the uptime check. `ApiMetricsAbsent` names the job `api`: edit it if
`OTEL_SERVICE_NAME` differs.

A refused install stops calling the API once it shows the update screen, so after a minimum is
raised for a version the store offers, the share of 426 stays small: `ApiClientsRefusedAsOutdated`
fires when most installs of a platform are refused, which is what a minimum above the store's
version does ([releases.md](releases.md#minimum-supported-version)). The app's own crashes are not
in these rules: they come from its Sentry project and the stores
([alerting.md](alerting.md#alert-catalog)).

### Use them with your backend

The files stay the same; only how they are loaded changes (REQUIRES CONFIGURATION):

- **Grafana Cloud** (or self-hosted Grafana Mimir): send the API's OTLP to the stack
  ([OpenTelemetry](#opentelemetry)). Dashboards: Dashboards → New → Import, one JSON file at a
  time, choosing the stack's Prometheus data source for `datasource`; or from a pipeline, Grafana's
  HTTP API (`POST /api/dashboards/db` with `{"dashboard": <file>, "overwrite": true}`). Rules, with
  [mimirtool](https://grafana.com/docs/mimir/latest/manage/tools/mimirtool/): each file becomes a
  namespace named after it, evaluated by the stack's ruler, listed in Alerting → Alert rules as
  data source-managed:

  ```sh
  mimirtool rules check observability/prometheus/rules/*.yaml   # offline
  mimirtool rules load observability/prometheus/rules/*.yaml \
    --address=<the stack's Prometheus URL> --id=<its instance id> --key=<token with rules:write>
  ```

- **Grafana and Prometheus, self-hosted:** the dashboards through a file provider like
  `observability/grafana/dashboards.yaml` (or imported as above); the rule files in Prometheus'
  `rule_files` (`promtool check config` before reloading); an Alertmanager for the routing.
- **The data source's scrape interval**, in every case: the API pushes its metrics every
  `OTEL_METRIC_EXPORT_INTERVAL` (60 s), and the panels' `$__rate_interval` is derived from the
  Prometheus data source's scrape interval (15 s unless set). Set it to 60 s (the data source's
  settings, "Scrape interval"), or the rate panels can show gaps or nothing over short ranges. The
  2-minute rules (`ApiReadinessFailing`, `ApiDatabaseErrors`) need two exports in their window:
  keep `OTEL_METRIC_EXPORT_INTERVAL` at 60000 or below.
- **Routing**, in every case: `severity="critical"` to the on-call person's pager,
  `severity="warning"` to the team's channel, per
  [alerting.md](alerting.md#escalation-requiere-configuración).

## Metrics

With telemetry on, these answer the usual questions (names as exported; Prometheus converts dots to
underscores and adds unit suffixes, `http_server_request_duration_seconds`):

| Question                 | Metric                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Example (PromQL)                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request count            | `http.server.request.duration` (count)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `sum by (http_route) (rate(http_server_request_duration_seconds_count[5m]))`                                                                                             |
| Error rate               | same, by `http_response_status_code`; `app.server.errors` by `error.origin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `(sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) or vector(0)) / sum(rate(http_server_request_duration_seconds_count[5m]))` |
| Latency p50 / p95 / p99  | `http.server.request.duration` (histogram)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket[5m])))`                                                              |
| Database latency         | `db.client.operation.duration` (pg), slow query count `app.db.slow_queries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `histogram_quantile(0.95, sum by (le) (rate(db_client_operation_duration_seconds_bucket[5m])))`                                                                          |
| Connection exhaustion    | `db.client.connection.count` (state used/idle), `db.client.connection.max`, `db.client.connection.pending_requests`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | pending requests above zero for minutes                                                                                                                                  |
| External service latency | `app.dependency.duration` (dependency, outcome, status), `http.client.request.duration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | p95 and failure share per `dependency_name`                                                                                                                              |
| Degraded features        | `app.degraded.operations` (feature, dependency)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | any increase while Redis is down                                                                                                                                         |
| Cache effectiveness      | `app.cache.operations` (namespace, result)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | hit ratio per namespace                                                                                                                                                  |
| Email                    | `app.mail.outbox.waiting`, `app.mail.outbox.oldest_age` (gauges, the shared queue); `app.mail.deliveries` (kind, outcome: sent, retry, failed, expired; retry per attempt, the others once per outcome a worker records: a message two workers sent after a takeover counts as sent twice, one retried by hand can fail again, and a notice an undo drops unsent counts as expired, by the undo or by the worker holding it, and not at all when that worker died); `app.mail.delivery.duration` (the SMTP exchange); `app.mail.latency` (queued to accepted); `app.mail.suppressed` (per-address limits) | `max(app_mail_outbox_oldest_age_seconds)`; `sum by (outcome) (increase(app_mail_deliveries_total[1h]))`                                                                  |
| Push notifications       | `app.push.outbox.waiting`, `app.push.outbox.oldest_age` (gauges, the shared queue); `app.push.deliveries` (kind, outcome: sent, delivered, retry, failed, unregistered, expired); `app.push.devices.disabled` (tokens the push service reported dead)                                                                                                                                                                                                                                                                                                                                                     | `max(app_push_outbox_oldest_age_seconds)`; `sum by (outcome) (increase(app_push_deliveries_total[1h]))`                                                                  |
| Outdated app versions    | `app.client.outdated` (`app.platform`): requests refused with 426 because the app is older than `MOBILE_MIN_VERSION_IOS`/`MOBILE_MIN_VERSION_ANDROID`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `sum by (app_platform) (increase(app_client_outdated_total[1h]))` after raising a minimum                                                                                |
| Account deletions        | `app.account.deletions` (no attributes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `sum(increase(app_account_deletions_total[1d]))`                                                                                                                         |
| Process health           | `nodejs.eventloop.delay.*`, `v8js.memory.heap.used`, `v8js.gc.duration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | event loop p99 delay                                                                                                                                                     |
| CPU and memory           | `process.cpu.time`, `process.memory.usage`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `rate(process_cpu_time_seconds_total[5m])` against the container's CPU limit                                                                                             |

`app.client.outdated` counts only requests that say they come from the app (`X-App-Platform`); the
app in this repository sends that header and `X-App-Version` on every request
([releases.md](releases.md#minimum-supported-version),
[ADR 0010](adr/0010-minimum-supported-app-version.md)), and `ApiClientsRefusedAsOutdated` watches
the share of them refused ([Alerts](#alerts)). `app.account.deletions` counts the
deletions an owner made from the app ([ADR 0012](adr/0012-account-deletion.md)), never who.

Percentiles are computed by the backend from histogram buckets; the API exports the buckets, not
precomputed percentiles. CPU and memory of the container itself (limits, throttling, OOM kills)
come from the platform (cAdvisor, the cloud provider's metrics), not from inside the process.

In Prometheus, `job` comes from `service.name` and `instance` from `service.instance.id`; the
other resource attributes (`deployment.environment.name`, `service.version`) are in `target_info`
unless the backend keeps them as labels (Prometheus: `otlp.promote_resource_attributes`). To read
staging and production apart, keep `deployment.environment.name` as a label or use one backend per
environment.

**The first export of a new series is not counted.** The API pushes cumulative values, and
Prometheus computes `rate()` and `increase()` from the difference between two samples of a series.
A series starts when an API process records the first value of a label set: its first export has
no sample before it, so what it holds (the first export interval, 60 s) is in no `rate()` or
`increase()`. Every process does this once per label set, and every restart or deployment starts
new series (`instance` is new). With steady traffic the loss is small. A rare event is another
matter: a counter that one process increments once, such as `app.account.deletions` on a quiet day
or `app.client.outdated` right after a minimum is raised, reads zero in `increase()`. Read rare
counters as raw values per `instance`, or over long ranges.

Add a metric for a feature in `apps/api/src/observability/metrics.ts`, with low-cardinality
attributes only: never user ids, emails or raw paths as attribute values; then add it to the
[metric catalog](#metric-catalog).

### Metric catalog

`observability/api-metrics.json` lists the series the API exports, named as Prometheus stores them
(dots become underscores; the unit and `_total` become suffixes; a histogram is `<name>_bucket`,
`_count` and `_sum`), with their type and attribute labels. Resource labels (`job`, `instance`...)
are on every series and not listed. Dashboards and rules may read these and the series recording
rules write, nothing else: `pnpm observability:check` refuses any other name
([Dashboards and alerts as code](#dashboards-and-alerts-as-code)).

`apps/api/src/observability/metrics-catalog.spec.ts` (a unit spec: `pnpm test`, and CI's unit job)
keeps it true to the code. It starts the SDK with in-memory exporters, records every application
metric once with every optional attribute set, and fails when:

- a metric the process exports (the runtime and process metrics among them) is missing from the
  catalog, or listed with another type;
- the application's own metrics (`app_*`, `process_*`) and the catalog's differ at all: a metric
  missing or extra, an attribute more or fewer.

Metrics that only appear with traffic (HTTP server and client, database, Redis) are not exported in
the spec, so their entries are not checked by it.

**Updating it** is done by hand, with the spec as the check:

1. A new application metric: add the instrument and its `record...` function in
   `apps/api/src/observability/metrics.ts`; call that function in the spec with every optional
   attribute set; add the entry to the catalog under its Prometheus name (the spec's
   `prometheusName()` is the rule), with its type and its attribute keys, dots as underscores,
   sorted. `pnpm --filter api test` passes when the three agree.
2. A renamed or removed metric, or a changed attribute: change the catalog with the code; the spec
   fails until both agree.
3. After upgrading an instrumentation (`@opentelemetry/*`, node-redis), rewrite the catalog from
   real series: start the [local backend](#local-backend), run the API against it with traffic
   that exercises every metric (requests, database queries, Redis, email, push), then
   `node scripts/check-observability.mjs --update-catalog http://localhost:9100` and review the
   diff (by hand, Prometheus lists them too:
   `curl -s http://localhost:9100/api/v1/label/__name__/values`, and
   `/api/v1/series?match[]=<name>` for a metric's labels). `pnpm observability:check` then says
   whether a dashboard or rule reads a name that changed.

## Database

| To detect             | Signal                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Database unavailable  | readiness 503 (`Database unreachable`), `Database unreachable at boot`, `error.origin=database` errors, failing pg spans  |
| Slow queries          | `Slow query (812 ms): SELECT ...` warnings (statement only, `DB_SLOW_QUERY_MS`), `app.db.slow_queries`, pg span durations |
| Connection exhaustion | pool metrics (used vs. max, pending requests); requests failing after the 5 s connect timeout                             |
| High latency          | `db.client.operation.duration` p95/p99                                                                                    |
| Failed transactions   | 5xx with `error.origin=database` (logged with stack, reported); error status on pg spans                                  |

Queries are never logged with their values, and spans record statements with placeholders only
(`enhancedDatabaseReporting` stays off). Don't log every query: the slow query log and the spans
are enough; raise `DB_SLOW_QUERY_MS` if it gets noisy, lower it to hunt (0 turns it off). Pool
size and the connection budget: [database.md](database.md#connections).

## External services

Call third-party APIs through `createExternalHttpClient`
(`apps/api/src/common/http/external-http.ts`, with a usage example in its header comment):
per-attempt timeout (5 s by default), retries with backoff (2 by default) only for idempotent
requests and retryable failures (network, timeout, 429, 502-504, honoring `Retry-After`), the
request id and trace context forwarded, one metric (`app.dependency.duration` with
`dependency.name`, outcome, status) and one log line per call with method and path only. A failure
raises `ExternalServiceError`, which the error filter answers with 502 (or 504 for a timeout) and
records as `origin: dependency`, so a provider's outage is never counted as an application bug. API
keys come from env through the `headers` option and are never logged.

## Uptime monitoring

REQUIRES CONFIGURATION: any external uptime service works (status page tools, the cloud
provider's synthetic checks, a self-hosted prober); none is assumed.

| Check                                                                                                                 | From                                                                       | Detects                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET https://<public URL>/healthz`, expect 200 within 5 s                                                             | outside, several regions, every 1 min                                      | the web tier down, timeouts, TLS/DNS problems, the certificate                                                   |
| `GET https://<public URL>/api/auth/capabilities`, expect 200 within 5 s                                               | outside, several regions, every 1 min                                      | API unreachable through the web server                                                                           |
| `GET https://<public URL>/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`, expect 200 JSON | outside, every 5 min                                                       | the app's links opening the browser ([incident-response.md](incident-response.md#18-app-links-open-the-browser)) |
| `GET http://<api>:3000/api/health/ready`, expect 200                                                                  | inside the platform (the orchestrator, or a prober on the private network) | readiness failure, database down, required Redis down                                                            |

`/api/auth/capabilities` is public and reads only the configuration, never the database; a prober
sends no `X-App-Platform`, so the minimum version check never refuses it, and one check a minute is
far below the per-address rate limit (`RATE_LIMIT_MAX`, 100 a minute). The link files answer 404
until the app's identity is set ([environment.md](environment.md#web-variables)): add their check
once it is. Alert after two or three consecutive failures from more than one location (one failed
probe is noise). The readiness probe must stay off the public internet. On DigitalOcean, Terraform
creates the `/healthz` check and its alerts ([deploy-vps.md](deploy-vps.md#provision-with-terraform-digitalocean)).

## Alerting

The rules ship in `observability/prometheus/rules` ([Dashboards and alerts as
code](#dashboards-and-alerts-as-code)); loading them and routing their notifications is REQUIRES
CONFIGURATION in the chosen backend. The SLIs, SLOs and error budget, the burn-rate alerts, the
CRITICAL and WARNING catalog with thresholds, evaluation windows and escalation, the app's
stability alerts, and the log patterns that alert without metrics: [alerting.md](alerting.md). What
to do when an alert fires: [incident-response.md](incident-response.md).

## The app

The app reports its own crashes and errors to its own Sentry project (React Native), through
`apps/mobile/src/lib/observability/`: off without `EXPO_PUBLIC_SENTRY_DSN`, tagged with the
release and build of the binary, the environment (`EXPO_PUBLIC_APP_ENV`) and the OTA update
(`update.id`, `update.channel`), and scrubbed before anything leaves the device. What it reports,
its breadcrumbs, the redaction and the upload of source maps:
[mobile-architecture.md](mobile-architecture.md#observability) and
[Errors](mobile-architecture.md#errors); what may never leave the device:
[SECURITY.md](../SECURITY.md#logging-and-reports) and its
[data inventory](../SECURITY.md#data-inventory).

**From a report on a phone to the API:**

1. Every request from the app carries an `X-Request-Id` the app generates (128 random bits as hex,
   `apps/mobile/src/api/http.ts`). The API keeps a well-formed incoming id, so both sides know the
   request by the same id.
2. A call that fails leaves a `network` breadcrumb with the method, the path (no query string),
   the status (a 5xx, `timeout` or `network`) and the `requestId`: an app issue in Sentry lists the
   ids of the calls that failed before it. An error answer also keeps the id the API returned on
   the `AppError` (`details.requestId`, `apps/mobile/src/api/unwrap.ts`). A 4xx is an expected
   outcome: when reported, its breadcrumb records the kind and status, not the id.
3. With that id: the API's log lines (the access line, the error line with its origin, every line
   written while serving it carry `requestId`), the API's Sentry issue (tag `request_id`), and with
   tracing on, the request's trace (span attribute `app.request_id`, then `traceId`).

A user who reports a problem can give the request id or the Sentry event
(`.github/ISSUE_TEMPLATE/bug_report.yml`). The app's release and OTA update say which build sent
the request; the API's `release` says which build answered it.
