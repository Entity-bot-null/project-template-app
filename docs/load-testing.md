# Load testing

**OPTIONAL / PROJECT-SPECIFIC.** The template installs no load testing tool and runs no load test in
CI: the numbers only mean something against an environment sized like production, with the
product's own traffic shape. This page says when to do it, what to run against the API the app
calls, what to watch with the signals the template already exports, and what "passed" means. The
app itself is not load tested: its performance on the device has its own checks
([performance.md](performance.md)).

## When a project needs it

- Before a launch, a campaign or a contract that brings traffic well above today's.
- When the product commits to latency (an SLA, a latency SLO, docs/alerting.md#slis-and-slos).
- After changes to hot paths: authentication, queries over large tables, a new cache, a new
  instance size, a different `DB_POOL_MAX`.
- To size capacity: how many instances for the expected peak, where autoscaling should trigger,
  what the database must handle.

An internal tool with a few dozen users does not need it; watching the production metrics does.

## Where to run it

- **Staging sized like production**: the same instance count, CPU and memory limits, database
  class, Redis and `RATE_LIMIT_STORE`, and a production-like data volume (an anonymized copy:
  production data in a test environment needs production's access control).
- **Never production** without an agreement: a load test spends the error budget, fires alerts and
  fills the rate limiters.
- **The generator outside the platform**, where users come from, on a machine that is not the
  bottleneck itself (watch its CPU).
- `docker compose --profile stack` on a laptop is for debugging the scripts, never for numbers.

## What skews results in this template

- **Rate limits.** Every route allows `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_SEC`
  (100 per minute by default), counted per signed-in person, or per client IP without a valid
  access token; sign-in allows 10 a minute per address tried and refresh 10 per refresh token, each
  with a ceiling per client IP (300 and 600 a minute), sized for phones behind one carrier address
  ([security.md](security.md#rate-limiting)). A generator with one account measures the limiter
  (429): give each virtual user its own account, and in the test environment only, raise
  `RATE_LIMIT_MAX`; spread sign-ins over many addresses, with `TRUST_PROXY` set so the API sees
  them.
- **Refresh tokens are single-use.** Each renewal rotates the refresh token the app keeps;
  presenting an old one more than 30 seconds later revokes the whole session family and logs
  `Refresh token reuse` (theft detection,
  [ADR 0007](adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md)). Never share a refresh
  token between virtual users or replay one. Each virtual user signs in with its own account and
  renews with its own refresh token, only when its 15-minute access token expires, as the app
  does.
- **The app's headers.** The app sends `X-App-Platform` and `X-App-Version` on every request; with
  a minimum version set (`MOBILE_MIN_VERSION_*`), a generator that sends them must send a version
  at or above it, or it measures 426 answers.
- **Writes are idempotent.** The app sends an `Idempotency-Key` with each new item, and Redis keeps
  the claim: a generator that reuses keys measures the replay path, not the write. One key per
  write, unless the replay is what the scenario measures.
- **Sign-in is slow on purpose** (argon2id): its throughput is CPU-bound by design. Test it as its
  own scenario with many accounts and addresses, not mixed with reads.
- **Accounts:** create test accounts in the test environment; the development seed (public
  passwords) refuses any database that is not local.
- **Health probes** are not measured (no metrics, no traces): do not use them as load.
- **Caches:** say whether a run is cold or warm; with Redis down the cache falls back to the
  database, which is a scenario of its own (docs/architecture.md#degradation).
- **External services:** never load real providers (quotas, costs, terms): stub them or use their
  sandbox. What to measure is our side: timeouts, retries, `app.dependency.duration`.

## Scenarios

| Scenario         | Load                                                                                              | Duration        | What it answers                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Normal load      | the expected traffic mix at a constant rate (REQUIERE CONFIGURACIÓN: from analytics or estimates) | 15 to 30 min    | the SLOs hold with headroom                                                              |
| Peak             | the forecast peak (starting point: 2 to 3 times normal), reached in about 5 minutes               | 15 min          | the SLOs hold at peak; autoscaling reacts in time                                        |
| Stress           | increasing until latency or errors break the SLO                                                  | until it breaks | the breaking point and the first bottleneck; failure is graceful (429, 503), not crashes |
| Soak             | normal load                                                                                       | 2 to 8 hours    | leaks, connection exhaustion, slow degradation, log and storage growth                   |
| Spike (optional) | from normal to 5 to 10 times in seconds                                                           | 10 min          | recovery once the spike ends                                                             |

**Critical endpoints of the template** (add the product's own, weighted by real usage):

| Endpoint                        | Why                                                       | Notes                                                           |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/items?limit=&offset=` | the app's main screen: an owned, paginated list           | the bulk of a read scenario; one account per virtual user       |
| `POST /api/items`               | the app's write, with its `Idempotency-Key`               | a new key per write; Redis on, as in production                 |
| `GET /api/users/me`             | the typical authenticated read: token check and one query | every app start                                                 |
| `POST /api/auth/sign-in`        | CPU-heavy, rate limited                                   | its own scenario, many accounts and addresses                   |
| `POST /api/auth/refresh`        | a write with a per-user row lock                          | one refresh token per virtual user, only when the token expires |
| `GET /api/users?limit=&offset=` | a paginated list query (`limit` at most its maximum)      | admin token                                                     |
| `GET /` and `/_astro/*`         | the public site (the web image: static files and nginx)   | usually served by a CDN in front of the server                  |

## Success criteria

Write the targets before the run (REQUIERE CONFIGURACIÓN: they come from the SLOs and the
expected traffic); read the results from the server side as well as from the generator, whose
numbers include the network.

| Measure               | Passes when                                                                                                    | Read from                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| p95 / p99 latency     | within the latency SLO at normal load and at peak, per route class                                             | `http.server.request.duration` by `http.route`; the generator         |
| Error rate            | 5xx below the availability SLO's budget (under 0.1 % for 99.9 %); 429 only where the test meant to hit a limit | `app.server.errors` by `error.origin`; the generator                  |
| CPU and memory        | headroom left at peak (starting point: under 70 % of the limits); memory flat during the soak                  | platform metrics, `process.memory.usage`, `v8js.memory.heap.used`     |
| Event loop            | delay stays low (starting point: p99 under 100 ms)                                                             | `nodejs.eventloop.delay.p99`                                          |
| Database connections  | no waiting for a connection at normal load; instances × `DB_POOL_MAX` within the database's limit              | `db.client.connection.pending_requests`, `db.client.connection.count` |
| Database              | `db.client.operation.duration` p95 stable; no new `Slow query` warnings; CPU and IO headroom on the server     | pg metrics, slow query log, the provider                              |
| Redis                 | command duration well under `REDIS_COMMAND_TIMEOUT_MS`; no `Redis unavailable`; memory under its limit         | node-redis metrics, Redis `INFO`                                      |
| External dependencies | timeouts and retries behave; no retry storm                                                                    | `app.dependency.duration` by outcome                                  |

Turn telemetry on (`OTEL_EXPORTER_OTLP_ENDPOINT`) with the production sampler settings during the
run: the traces of the slowest requests show where the time goes. Record each run: release,
environment sizes, data volume, scenario, results, the bottleneck found and what changes.

## Example (reference only)

k6 is one common choice; it is not part of the template. If a project adopts it, its image goes in
`scripts/tool-images/Dockerfile` pinned by digest like the other tools. A read scenario at a
constant rate, with the token obtained once per run:

```js
// load/read.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    normal: {
      executor: 'constant-arrival-rate',
      rate: 50, // requests per second: the expected normal load
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{route:me}': ['p(95)<250', 'p(99)<1000'],
  },
};

// One sign-in before the load: sign-in is rate limited and slow on purpose. The access token
// lasts 15 minutes; a longer run signs in again (one account per virtual user) or renews with
// its own refresh token (data.refreshToken), as the app does.
export function setup() {
  const res = http.post(
    `${__ENV.BASE_URL}/api/auth/sign-in`,
    JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: res.json('data.accessToken') };
}

export default function ({ token }) {
  const res = http.get(`${__ENV.BASE_URL}/api/users/me`, {
    // The headers the app sends (above the minimum version, if one is set).
    headers: {
      Authorization: `Bearer ${token}`,
      'X-App-Platform': 'android',
      'X-App-Version': '1.0.0',
    },
    tags: { route: 'me' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

```
docker run --rm -i -e BASE_URL=<staging URL> -e EMAIL=<test account> -e PASSWORD=<its password> \
  grafana/k6 run - < load/read.js
```

From one address this run needs `RATE_LIMIT_MAX` raised in the test environment (50 requests per
second is 3000 per minute on one route).
