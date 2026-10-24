# Architecture Decision Records

Significant decisions are recorded here, one file per decision, so the next person knows why
things are the way they are.

**Write one when** a choice is hard to reverse or affects several features: a dependency of
consequence (especially one with native code), a navigation or state pattern, an API shape, a
security trade-off, a release process change, a deviation from these docs.

**How:**

1. Copy [template.md](template.md) to `NNNN-short-title.md` (next number, kebab-case).
2. Fill it in; status `Proposed`.
3. Open a pull request; the discussion happens there.
4. On merge the status becomes `Accepted`. Decisions are not edited afterwards: a later ADR
   supersedes them (and the old one links to it).

| ADR                                                                | Decision                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [0001](0001-stack.md)                                              | The stack: Expo, its libraries, and what was ruled out                       |
| [0002](0002-pnpm-monorepo.md)                                      | The repository is a pnpm workspace, one package per app                      |
| [0003](0003-security-analysis-supply-chain-and-release-tooling.md) | Semgrep, zizmor, Dependabot, pnpm's supply-chain settings and release-please |
| [0004](0004-observability-and-optional-infrastructure.md)          | OpenTelemetry and Sentry for observability; Redis optional behind adapters   |
| [0005](0005-transactional-email-outbox.md)                         | Email through a transactional outbox in PostgreSQL, over SMTP                |
| [0006](0006-security-version-in-access-tokens.md)                  | A security version ends every access token at once on a credential change    |
| [0007](0007-mobile-sessions-with-refresh-tokens-in-the-body.md)    | Mobile sessions: tokens in the body, rotation, a 30-second reuse window      |
| [0008](0008-public-site-and-app-links.md)                          | A static Astro site and the app's link files, served by one web image        |
| [0009](0009-postgresql-and-redis-on-the-server.md)                 | The reference server runs PostgreSQL and Redis; a managed database optional  |
| [0010](0010-minimum-supported-app-version.md)                      | The API refuses app versions below a configured minimum with 426             |
| [0011](0011-push-notifications-outbox.md)                          | Push notifications through an outbox in PostgreSQL, over Expo's push service |
| [0012](0012-account-deletion.md)                                   | Accounts are deleted for good, at their owner's request, in one transaction  |
