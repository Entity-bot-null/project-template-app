# Code review

Every change reaches `main` through a pull request with a green **CI passed** check and the
approvals the ruleset asks for (`.github/rulesets/main.json`). Review is for correctness, security,
the release impact and maintainability; formatting and style are already enforced by the tools, so
reviewers do not discuss them.

## Author

- Small pull requests (aim for under 400 changed lines, generated files aside); split otherwise.
- Fill in the template (`.github/pull_request_template.md`): what, why, how it was tested (devices
  included), screenshots of UI changes, the release impact (OTA update or store build), the
  Definition of Done checklist. Self-review the diff first.
- `pnpm verify` passes; `pnpm test:integration` when the API changed, `pnpm test:e2e:mobile` when
  a critical journey changed.
- Point reviewers at the contract diff (`openapi/openapi.json`), migrations and native
  configuration changes when there are any.
- Answer every comment (a change or a reason); resolve threads only when the reviewer agrees.

## Reviewer checklist

**Behavior**

- [ ] Does it do what the issue asks, including edge cases (empty, max, concurrent, failure)?
- [ ] Loading, empty, error and offline states; a request interrupted by the app going to the
      background or the session ending.
- [ ] Are the tests meaningful: would they fail if the code were wrong?

**The app**

- [ ] The layer rules ([mobile-architecture.md](mobile-architecture.md)): routes stay thin, server
      data only through the TanStack Query hooks, UI only from `apps/mobile/src/ui`.
- [ ] Accessibility: roles and labels on every control, 48 dp targets, the largest font size,
      TalkBack and VoiceOver ([accessibility.md](accessibility.md)).
- [ ] The release impact is right: a native change (a module, a permission, a config plugin,
      `app.config.ts` native fields) is marked as needing a store build.
- [ ] Links and notifications are validated (`apps/mobile/src/lib/links.ts`); nothing sensitive
      in plain storage, logs or analytics.

**Security**

- [ ] Every new route: `@Auth(...)` with the right roles, or deliberately public with a reason.
- [ ] Object-level access: can a user read or change someone else's record by changing an id?
      The owner filter is in every query and scoped write, and each route on one record has an
      access-matrix test ([authorization.md](authorization.md)).
- [ ] Input validated with a schema; sizes bounded; output built from an explicit select.
- [ ] No secrets, tokens or personal data in code, logs, errors or responses.
- [ ] New dependency: needed, maintained, New Architecture compatible for the app, license
      acceptable, audit clean, install scripts justified.

**API and data**

- [ ] Contract change reviewed: names, status codes, pagination, and compatibility with every app
      version still installed (additive only, [api-conventions.md](api-conventions.md)).
- [ ] Migration safe to run while the previous version is live (expand/contract), indexes for new
      queries, no unbounded queries.

**Maintainability**

- [ ] Follows the conventions of the area ([architecture.md](architecture.md),
      [mobile-architecture.md](mobile-architecture.md)); no duplication of an existing helper.
- [ ] Errors handled through the standard paths ([error-handling.md](error-handling.md)).
- [ ] Names and comments explain why, not what.
- [ ] Docs, env examples and ADRs updated when behavior or decisions changed, the manual and the
      step-by-step guide in both languages.

## Etiquette

- Review within one working day; small pull requests first.
- Label comments: **blocking**, **suggestion**, **question**, **nit** (nits never block).
- Comment on the code, not the person; propose an alternative when rejecting one.
- Approve when it is good enough to merge and improve later, not when it is perfect.

## Merging

The author merges (squash) once approved and green; the title must be a Conventional Commit
([commits.md](commits.md)). Code owners (`.github/CODEOWNERS`) are requested automatically for
the paths they own: authentication, storage, observability, native configuration, the schema and
the contract, the server's deployment, release and CI files.
