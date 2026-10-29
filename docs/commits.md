# Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint
(`commitlint.config.mjs`): on every commit by the `commit-msg` hook, and on every pull request title
by the **Conventions** check (`conventions.yml`, again whenever the title is edited), since the
squash merge turns the title into the commit on `main`.

```
<type>(<optional scope>): <summary>

<optional body: what and why, wrapped at 100 columns>

<optional footers>
```

- **type:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`,
  `revert`.
- **scope:** the area: `mobile`, `api`, `landing`, `deploy`, `auth`, `items`, `db`, `deps`, `e2e`.
- **summary:** imperative, lowercase start, no final period, at most 100 characters in total.
- **Breaking change:** `!` after the type/scope and a `BREAKING CHANGE:` footer explaining the
  migration path. An API change that breaks installed apps is not shipped as a breaking change: it
  is split into additive steps ([api-conventions.md](api-conventions.md)).
- **References:** a tracker key or issue in a footer: `Refs: ABC-123`, `Closes #42`.
- **The release version:** `Release-As: <version>` in a footer chooses the next version instead of
  the one the types imply ([ci-cd.md](ci-cd.md#release-pull-requests)).

The titles on `main` are the release notes: `feat` and `fix` (and `perf`, `revert`) appear in
`CHANGELOG.md` and decide the next version (`fix` and `perf` patch, `feat` minor, `!` major; minor
while the version is 0.x), so write them for the people reading the release.

```
feat(items): share an item from its detail screen
fix(auth): keep the session when two requests get a 401 at once
perf(items): virtualize the search results
chore(deps): bump expo-image within SDK 58
feat(api)!: require the new item schema

BREAKING CHANGE: items without a title are rejected.
```

## Habits

- Small commits that each build and pass tests; one logical change per commit. Commits on a branch
  can be informal: the squash merge keeps the title only.
- Code, commit messages and documentation in English (user-facing copy in the product's
  languages; the manual and the step-by-step guide also in Spanish).
- No generated noise mixed with logic: `pnpm contract` output may share the commit of the change
  that caused it, formatting-only changes go in their own commit.
- Never commit secrets, `.env` files, keystores, certificates or personal data (hooks and CI scan
  for them; if one slips through, rotate it).
