# Engineering standards

The rules every change follows. Most are enforced by tools (column "Enforced by"); the rest are
checked in review. The reasons and details live in [docs/](docs/).

## Language and code

| Rule                                                                                                                                                           | Enforced by                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| TypeScript everywhere, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`/`Parameters`, no JavaScript in `src/` | `tsconfig.json`, `pnpm typecheck`          |
| No `any`, no unsafe member access or calls, no floating promises, no unnecessary conditions or assertions                                                      | ESLint `strictTypeChecked`                 |
| Type assertions (`as`) only where TypeScript cannot know (a narrowed native value), with a comment                                                             | review                                     |
| Type-only imports marked (`import { type X }`)                                                                                                                 | ESLint `consistent-type-imports`           |
| `===` only                                                                                                                                                     | ESLint `eqeqeq`                            |
| No `// eslint-disable` without a reason; unused disables are errors                                                                                            | ESLint `reportUnusedDisableDirectives`     |
| One formatting style (Prettier: single quotes, 100 columns)                                                                                                    | `pnpm format:check`, pre-commit            |
| No `console.log` (use `logger`; `console.warn`/`console.error` only where the logger cannot be used)                                                           | ESLint `no-console`                        |
| The Rules of React and of hooks, so the React Compiler can optimize                                                                                            | ESLint (`eslint-config-expo`, React hooks) |
| Code, comments, commits and docs in English (the exceptions: `docs/MANUAL.es.md` and `docs/STEP_BY_STEP.es.md`, the Spanish manual and guide)                  | review                                     |
| Comments explain why, not what                                                                                                                                 | review                                     |
| Names say what things are: `useItems`, `ItemsScreen`, `itemKeys`, `toInternalPath`; files named after their main export                                        | review                                     |

## Architecture

The layers and their import rules are in
[docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md#layers-and-dependency-rules).

| Rule                                                                                                    | Enforced by                       |
| ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Routes (`src/app`) do not reach the API or storage                                                      | ESLint `no-restricted-imports`    |
| `fetch` and `openapi-fetch` only in `src/api`                                                           | ESLint                            |
| Storage modules only through `src/lib/storage`                                                          | ESLint                            |
| Sentry only through `src/lib/observability`                                                             | ESLint                            |
| Text, inputs, buttons, images only from `src/ui`; colors only from the theme                            | ESLint                            |
| `process.env` only in `src/config/env.ts`                                                               | ESLint `no-restricted-properties` |
| Server data in TanStack Query, client state in Zustand, never copied between them                       | review                            |
| A feature does not import another feature's internals                                                   | review                            |
| Native projects are generated, never edited; native configuration in `app.config.ts` and config plugins | `.gitignore`, review              |
| Significant decisions recorded as ADRs ([docs/adr/](docs/adr/))                                         | review                            |

## API and data

- Contract first: `openapi/openapi.json` changes with the code that needs it; generated types are
  committed and drift-checked ([openapi/README.md](openapi/README.md)).
- Every response validated with Zod before use (`unwrapWith`); every form with a Zod schema; every
  stored value read back through a schema.
- Errors are `AppError`s; users see `userMessage()`, never a technical message
  ([docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md#errors)).

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
- Credentials only in secure storage; no personal data in logs, analytics or error reports.
- Links, notifications and API responses are validated input; links never act by themselves.
- Permissions asked in context, only those used.
- No security finding is silenced without its reason on the same line (`nosemgrep`,
  `eslint-disable`), visible in review.
- Full list: [SECURITY.md](SECURITY.md).

## Supply chain

| Rule                                                                                   | Enforced by                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Dependencies from the registry, locked with integrity hashes                           | frozen installs, `pnpm deps:check`                   |
| A release must be seven days old; a version with weaker publishing evidence is refused | `minimumReleaseAge`, `trustPolicy`, Dependabot       |
| No install script runs unless reviewed                                                 | `allowBuilds`                                        |
| SDK-managed packages at the versions the Expo SDK expects                              | `pnpm expo:doctor`                                   |
| Allowed licenses; exceptions recorded with a reason                                    | `pnpm deps:check` (`scripts/dependency-policy.json`) |
| No high or critical advisory                                                           | `pnpm audit`                                         |
| Actions pinned by SHA, tool images by digest; workflows least-privilege                | zizmor, actionlint                                   |

## Performance

- Lists virtualized; no work in render that could run once; images through `Image`
  ([docs/PERFORMANCE.md](docs/PERFORMANCE.md)).
- The bundle stays within `bundle-budget.json` (`pnpm bundle:check`).
- Optimizations come with a measurement, on a release build.

## Testing

- Unit and component tests next to the code (`*.spec.ts(x)`), screen-to-API integration tests
  (`*.int.spec.tsx`), Maestro flows for critical journeys ([docs/TESTING.md](docs/TESTING.md)).
- Tests query by role and label, and stub the network, not the code.
- Coverage thresholds are a ratchet: never lowered silently.
- Every bug fix starts with a failing test.

## Workflow

- Short-lived branches, Conventional Commits, pull requests only, squash merge
  ([CONTRIBUTING.md](CONTRIBUTING.md)).
- Hooks on commit and push; every gate in CI, one required check ([docs/CI_CD.md](docs/CI_CD.md)).
- Releases: semantic versions from commit titles; builds, submissions and OTA updates started by
  people, from `main`, through protected workflows ([docs/RELEASES.md](docs/RELEASES.md)).
- Done means [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).

## The pipeline

```
code → format → lint → typecheck → test → coverage → doctor → security → bundle → CI → review → merge
        └──────────────────────── pnpm verify (pre-commit / pre-push: the fast part) ─────────────┘
                                  CI adds: SAST, workflow audit, gitleaks history, prebuild, E2E (Android)

merge → release PR → tag → EAS build (preview → production) → internal testing → staged store rollout
                         └ JavaScript fixes: EAS update (preview → production, staged) ┘ → observe (Sentry)
```
