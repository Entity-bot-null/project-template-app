# Branch strategy

Trunk-based: `main` is always releasable, work happens on short-lived branches merged through pull
requests. A release is a tag on `main`: the app's builds and OTA updates and the server's
deployments all take a commit or tag of `main`, never another branch.

```
main ──●────────●──────────●──── (protected: pull requests only, CI passed, squash merge)
        \      /  \        /
         feat/...   fix/...
```

## Rules

- **Never push to `main`.** The pre-push hook refuses it locally (works on any GitHub plan); the
  ruleset in `.github/rulesets/main.json` enforces it on the server where the plan allows, and
  `main-guard.yml` opens an issue for any commit on `main` that did not come from a pull request.
- **One branch per change**, from an up-to-date `main`, merged within days. Rebase on `main` (or
  merge it in) when it moves; CI must pass on the latest commit.
- **Squash merge.** The pull request title (Conventional Commits, [commits.md](commits.md)) becomes
  the commit on `main`.
- **Delete the branch** after merging.
- No long-lived branches (`develop`, `release/*` kept open for weeks): unfinished work is hidden
  behind a feature flag instead ([mobile-architecture.md](mobile-architecture.md#feature-flags)).

## Naming

```
<type>/<short-description>
```

| Type       | For                                 |
| ---------- | ----------------------------------- |
| `feat`     | new behavior                        |
| `fix`      | a bug fix                           |
| `hotfix`   | an urgent production fix            |
| `chore`    | maintenance, dependencies, tooling  |
| `docs`     | documentation only                  |
| `refactor` | code change without behavior change |
| `test`     | tests only                          |
| `perf`     | performance                         |
| `ci`       | CI/CD configuration                 |
| `build`    | build system, Docker, native builds |
| `release`  | release preparation                 |

Description: lowercase words separated by `-`; include the tracker key when there is one:
`feat/ABC-123-item-sharing`, `fix/session-expiry-race`. Letters, digits, `.`, `_` and `-` only.

Checked by `scripts/check-branch-name.mjs` in the pre-push hook and in CI (the **Conventions**
check, `conventions.yml`). Bot branches (`dependabot/...`, `renovate/...`, `release-please--...`)
are exempt.

## Hotfixes

Same flow, faster: `hotfix/...` from `main`, pull request, CI, review, merge. Then ship it the way
the fix needs ([releases.md](releases.md#what-can-ship-as-an-ota-update)):

- **The app, JavaScript only:** an OTA update of the new `main` to the affected runtime version
  (EAS update workflow), staged.
- **The app, native code:** a new build and store submission, expedited review on iOS if needed;
  halt the staged rollout of the broken one meanwhile.
- **The server:** deploy the new `main`, staging then production
  ([ci-cd.md](ci-cd.md#deployment)).

Installed apps keep running older versions: a server hotfix stays compatible with every app
version still supported ([ci-cd.md](ci-cd.md#compatibility-between-versions)).

## Releases

release-please opens the release pull request from the Conventional Commits on `main`; merging it
tags `v<version>` ([ci-cd.md](ci-cd.md#release-pull-requests)). Builds, updates and deployments name
that tag, so a rollback can name the previous one.
