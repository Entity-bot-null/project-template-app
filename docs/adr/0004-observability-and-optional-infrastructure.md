# 0004. Observe with OpenTelemetry and Sentry, and keep Redis optional behind adapters

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

This is the web template's ADR 0002 (`project-template-web` 2.0), adopted for the API
(`apps/api`), which was ported from it. The app's own error tracking, Sentry for React Native, was
chosen in [ADR 0001](0001-stack.md) and stays as it is. The web template's Web Vitals endpoint is
not part of this API: it has no browser client.

The API has structured logs, request ids, health probes and graceful shutdown. Production needs
more: error tracking, traces and metrics, and, for several instances, a shared store for rate
limits (plus cache, locks and idempotency when a feature needs them). The API must stay usable
without any account or hosted service (`pnpm install && pnpm dev`), keep every existing gate, and
avoid tying projects to one vendor. Security outranks everything: nothing sensitive may leave the
process, or the device, through these channels.

## Options

1. **Tracing and metrics:** a vendor SDK (Datadog, New Relic); `@opentelemetry/sdk-node` with
   auto-instrumentations (dozens of packages, gRPC and protobuf exporters); **a minimal
   OpenTelemetry setup**: the SDK packages, OTLP/HTTP exporters and five instrumentations (HTTP,
   Express, PostgreSQL, fetch through undici, Node.js runtime), loaded only when an endpoint is
   configured. The NestJS instrumentation is left out until it supports Nest 12.
2. **Error tracking, API:** `@sentry/node` 11 (sets up its own OpenTelemetry, conflicting with
   ours, and depends on `@sentry/bundler-plugins`, which brings the `sentry` CLI under FSL-1.1, a
   non-OSI license, into production); `@sentry/node-core` 10 (previous major); **`@sentry/core`
   11** (the base of every Sentry SDK, one dependency) with an explicit client: no
   auto-instrumentation, capture where the error filter and the crash handlers decide.
3. **Error tracking, app:** settled by [ADR 0001](0001-stack.md): **`@sentry/react-native`** with
   Expo's config plugin (JavaScript and native crashes, the release, build and OTA update of each
   event). Its CLI (FSL-1.1-MIT) runs at build time only, to upload source maps and native debug
   symbols, and is a recorded license exception (`scripts/dependency-policy.json`). The DSN is a
   build-time value (`EXPO_PUBLIC_SENTRY_DSN`, an EAS environment variable), public like every
   `EXPO_PUBLIC_*` value: it only allows sending events.
4. **Redis client:** ioredis (maintenance mode); **node-redis** (`@redis/client`, official,
   OpenTelemetry metrics built in). Rate limit store: a community package; **our own store** with a
   Lua script that replicates the throttler's algorithm, falling back to memory.
5. **Queues:** BullMQ now; **an integration point only** until a project needs one.
6. **Process metrics:** `@opentelemetry/host-metrics` (depends on `systeminformation`, a package
   with a history of command injection advisories); **two observable instruments** from
   `process.cpuUsage()` and `process.memoryUsage()`.
7. **Local backend:** none; **an optional Compose profile** with `grafana/otel-lgtm`
   (`docker compose --profile observability up`: OTLP on 4328, Grafana on 3011, Prometheus on
   9100).

## Decision

The options in bold. OpenTelemetry is the API's vendor-neutral instrumentation layer (export over
OTLP to any collector or provider); Sentry covers what traces do not (grouped errors, releases,
crashes on the devices) with every automatic collection of personal data off, in the API and in
the app. Redis is optional infrastructure: each feature has an interface, an in-process
implementation and a Redis adapter, and a documented degraded behavior (fallback to memory for rate
limits, misses for the cache, fail closed for locks and claims;
[architecture.md](../architecture.md#degradation)). The one claim the API makes, on the
`Idempotency-Key` of `POST /api/items`, is not what keeps a retried create single: the item's
unique key in the database is, so without Redis the create still works and the degradation is
counted ([api-conventions.md](../api-conventions.md#idempotency)). In the API, redaction is shared
by the logger, the error tracker and the span processor; in the app, every event is scrubbed before
it leaves (`apps/mobile/src/lib/observability`).

## Consequences

- No optional integration is needed to develop, test or deploy; turning one on is configuration
  (`OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN`, `REDIS_URL` with `RATE_LIMIT_STORE` and
  `CACHE_STORE` in the API; `EXPO_PUBLIC_SENTRY_DSN` in the app). ESLint keeps the SDKs and Redis
  out of feature code, in the API and in the app, so swapping a provider touches one adapter.
- `apps/api/src/main.ts` must load the application after telemetry (dynamic import), and its static
  imports must stay free of instrumented modules. Because Nest 12 imports its HTTP platform with
  `import()`, the SDK registers an in-thread ESM loader hook (import-in-the-middle,
  `module.registerHooks`) restricted to the instrumented modules; Node.js versions without it are
  outside `engines`.
- The API's Sentry glue (`apps/api/src/observability/sentry.ts`, about 160 lines on `@sentry/core`)
  is ours to maintain across Sentry majors; its options are typed so a renamed option fails the
  build. The app's Sentry SDK moves with the Expo SDK.
- The rate limit script must keep matching the throttler's in-memory algorithm when the throttler
  changes: the integration spec (`apps/api/src/infrastructure/infrastructure.int.spec.ts`) compares
  both.
- Every metric the API exports is listed in `observability/api-metrics.json`, and a spec fails when
  the code and the catalog disagree ([observability.md](../observability.md#metric-catalog)).
- Wrong if: projects routinely need what the minimal OpenTelemetry setup leaves out (then add the
  instrumentation, or move to a collector-side solution), or the Sentry glue costs more than
  `@sentry/node` once its licensing and OpenTelemetry coupling are fixed upstream.
