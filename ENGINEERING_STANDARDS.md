# Engineering standards

The rules every change follows. Most are enforced by tools (column "Enforced by"); the rest are
checked in review. The reasons and details live in [docs/](docs/).

## Language and code

| Rule                                                                                                                                                                       | Enforced by                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript everywhere, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`/`Parameters`, no JavaScript in `apps/mobile/src/` | `apps/mobile/tsconfig.json`, `tsconfig.base.json` (the API), `pnpm typecheck`; ESLint for JavaScript files in `apps/mobile/src/` |
| The repository's JavaScript tooling scripts type-checked through JSDoc                                                                                                     | `tsconfig.json` (root), `pnpm typecheck`                                                                                         |
| No `any`, no unsafe member access or calls, no floating promises, no unnecessary conditions or assertions                                                                  | ESLint `strictTypeChecked`                                                                                                       |
| Type assertions (`as`) only where TypeScript cannot know (a narrowed native value), with a comment                                                                         | review                                                                                                                           |
| Type-only imports marked (`import { type X }`)                                                                                                                             | ESLint `consistent-type-imports`                                                                                                 |
| `===` only                                                                                                                                                                 | ESLint `eqeqeq`                                                                                                                  |
| No `// eslint-disable` without the rules it disables and its reason (`-- why`, same line); unused disables are errors                                                      | ESLint `eslint-comments` (`require-description`, `no-unlimited-disable`), `reportUnusedDisableDirectives`                        |
| One formatting style (Prettier: single quotes, 100 columns)                                                                                                                | `pnpm format:check`, pre-commit                                                                                                  |
| No `console.log` (use `logger`; `console.warn`/`console.error` only where the logger cannot be used); none at all in the API (its `Logger`)                                | ESLint `no-console`                                                                                                              |
| No `eval`/`new Function`, no raw-SQL `*Unsafe` calls                                                                                                                       | ESLint, Semgrep (SAST)                                                                                                           |
| The Rules of React and of hooks, so the React Compiler can optimize                                                                                                        | ESLint (`eslint-config-expo`, React hooks)                                                                                       |
| Code, comments, commits and docs in English (the exceptions: `docs/manual.es.md` and `docs/step-by-step.es.md`, the Spanish manual and guide)                              | review                                                                                                                           |
| Comments explain why, not what                                                                                                                                             | review                                                                                                                           |
| Names say what things are: `useItems`, `ItemsScreen`, `itemKeys`, `toInternalPath`; files named after their main export                                                    | review                                                                                                                           |

## Architecture

The app's layers and their import rules are in
[docs/mobile-architecture.md](docs/mobile-architecture.md#layers-and-dependency-rules); the API's
modules in [docs/architecture.md](docs/architecture.md).

| Rule                                                                                                                        | Enforced by                       |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Routes (`apps/mobile/src/app`) do not reach the API or storage                                                              | ESLint `no-restricted-imports`    |
| `fetch` and `openapi-fetch` only in `apps/mobile/src/api`                                                                   | ESLint                            |
| Storage modules only through `apps/mobile/src/lib/storage`                                                                  | ESLint                            |
| Sentry only through `apps/mobile/src/lib/observability`                                                                     | ESLint                            |
| Text, inputs, buttons, touchables, images only from `apps/mobile/src/ui`; colors only from the theme                        | ESLint                            |
| `process.env` only in `apps/mobile/src/config/env.ts` (the app) and `apps/api/src/env/env.ts` (the API)                     | ESLint `no-restricted-properties` |
| API modules: thin controllers, rules and queries in services, Zod schemas in `dto/`                                         | review                            |
| The API uses the infrastructure adapters (cache, locks, idempotency), never Redis, Sentry or the OpenTelemetry SDK directly | ESLint `no-restricted-imports`    |
| Server data in TanStack Query, client state in Zustand, never copied between them                                           | review                            |
| A feature does not import another feature's internals                                                                       | review                            |
| Native projects are generated, never edited; native configuration in `apps/mobile/app.config.ts` and config plugins         | `.gitignore`, review              |
| Significant decisions recorded as ADRs ([docs/adr/](docs/adr/))                                                             | review                            |

## API and data

- The API generates the contract: `openapi/openapi.json` and the app's types are regenerated with
  the code that needs them (`pnpm contract`), committed and drift-checked on both sides
  ([openapi/README.md](openapi/README.md)). Changes are additive: installed apps keep the old
  contract ([docs/api-conventions.md](docs/api-conventions.md)).
- The API: `{ data, message }` envelope, `errors[]` on a 400 that names its fields; every input
  validated by a schema, every output built from an explicit select; errors through the standard
  filter, never leaking internals ([docs/error-handling.md](docs/error-handling.md)).
- The app: every response validated with Zod before use (`unwrapWith`, schemas that `satisfies` the
  generated types); every form with a Zod schema; every stored value read back through a schema.
- Errors in the app are `AppError`s; users see `userMessage()`, never a technical message
  ([docs/mobile-architecture.md](docs/mobile-architecture.md#errors)).
- Every schema change is a committed migration, compatible with the running version
  (expand/contract); snake_case tables, UUIDv7 keys, `timestamptz`, explicit `onDelete`
  ([docs/database.md](docs/database.md)).

## User interface

- Every screen handles loading, empty, error and offline states.
- Accessibility: every control has a role and an accessible name; touch targets at least 48 dp;
  text scales with the system font size (capped per variant, never disabled); contrast WCAG AA in
  light and dark (tested); state announced (`busy`, `disabled`, `checked`, alerts); screens usable
  with TalkBack and VoiceOver.
- Light and dark themes from tokens; layouts that survive small phones, large fonts and right-to-left
  text where the product supports it.
- Copy is short and specific; error messages say what happened and what to do.

## Security and privacy

- No secret in the app or in git; `EXPO_PUBLIC_*` values are public.
- Every API route `@Auth(...)` unless deliberately public; ownership checked in the service's query
  (404 for others' records) ([docs/authorization.md](docs/authorization.md)).
- Rate limits count a person, never an address alone: phones share carrier addresses
  ([docs/security.md](docs/security.md#rate-limiting)).
- Credentials only in secure storage; no personal data in logs, analytics or error reports.
- Links, notifications and API responses are validated input; links never act by themselves.
- Permissions asked in context, only those used.
- No security finding is silenced without its reason on the same line (`nosemgrep`,
  `eslint-disable`), visible in review.
- Full list: [SECURITY.md](SECURITY.md); the API's design: [docs/security.md](docs/security.md).

## Supply chain

| Rule                                                                                   | Enforced by                                                       |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Dependencies from the registry, locked with integrity hashes                           | frozen installs, `pnpm deps:check`                                |
| A release must be seven days old; a version with weaker publishing evidence is refused | `minimumReleaseAge`, `trustPolicy`, Dependabot, `pnpm deps:check` |
| No install script runs unless reviewed                                                 | `allowBuilds`, `pnpm deps:check`                                  |
| SDK-managed packages at the versions the Expo SDK expects                              | `pnpm expo:doctor`                                                |
| Allowed licenses; exceptions recorded with a reason                                    | `pnpm deps:check` (`scripts/dependency-policy.json`)              |
| No high or critical advisory in dependencies or the API images                         | `pnpm audit`, Trivy                                               |
| Actions pinned by SHA, tool images by digest; workflows least-privilege                | zizmor, actionlint; `scripts/tool-image.mjs` for the images       |

## Operations and observability

| Rule                                                                                                                    | Enforced by                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Everything the API's logger prints is redacted (credentials in keys and in text); logs carry ids, never personal data   | `AppLogger`, `redact.spec.ts`, `logger.spec.ts`  |
| Unexpected errors reach the error tracker through `errorTracker()` (API) / `reportError()` (app), never an SDK directly | ESLint `no-restricted-imports`                   |
| The API's own metrics live in `apps/api/src/observability/metrics.ts`, listed in `observability/api-metrics.json`       | `metrics-catalog.spec.ts`                        |
| Metric attributes are low-cardinality: never user ids, emails or raw paths                                              | review                                           |
| External services are called through `createExternalHttpClient` (timeouts, retries, correlation)                        | review                                           |
| Every optional dependency degrades instead of failing the boot; its degraded behavior is documented and tested          | integration specs (`infrastructure.int.spec.ts`) |
| Every cache entry has a TTL; sensitive data and authorization decisions are never cached                                | `CacheService` (TTL), review                     |
| Configuration validated at boot; one set of secrets per environment                                                     | `env.schema.ts`, review                          |

Details: [docs/observability.md](docs/observability.md), [docs/environment.md](docs/environment.md).

## Performance

- Lists virtualized; no work in render that could run once; images through `Image`
  ([docs/performance.md](docs/performance.md)).
- The bundle stays within `apps/mobile/bundle-budget.json` (`pnpm perf:check`).
- Optimizations come with a measurement, on a release build.

## Testing

- Unit and component tests next to the code (`*.spec.ts(x)`), the app's screen-to-API integration
  tests (`*.int.spec.tsx`), the API's integration tests on PostgreSQL (`*.int.spec.ts`), Maestro
  flows for critical journeys ([docs/testing.md](docs/testing.md)).
- Tests query by role and label, and stub the network, not the code.
- Coverage thresholds are a ratchet: never lowered silently.
- Every bug fix starts with a failing test.

## Workflow

- Short-lived branches, Conventional Commits, pull requests only, squash merge
  ([CONTRIBUTING.md](CONTRIBUTING.md)).
- Hooks on commit and push; every gate in CI, one required check ([docs/ci-cd.md](docs/ci-cd.md)).
- Releases: semantic versions from commit titles; builds, submissions and OTA updates started by
  people, from `main`, through protected workflows ([docs/releases.md](docs/releases.md)).
- Done means [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).

## The pipeline

```
code → format → lint → typecheck → test → coverage → doctor → security → build → CI → review → merge
        └──────────────────────── pnpm verify (pre-commit / pre-push: the fast part) ─────────────┘
                                  CI adds: SAST, workflow audit, gitleaks history, the API's
                                  integration suite and images (Trivy), prebuild, E2E (Android)

merge → release PR → tag → EAS build (preview → production) → internal testing → staged store rollout
                         └ JavaScript fixes: EAS update (preview → production, staged) ┘ → observe (Sentry)
```
