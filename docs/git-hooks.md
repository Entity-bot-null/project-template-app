# Git hooks

Installed by `pnpm install` (the root `prepare` script runs Husky, which sets `core.hooksPath` to
`.husky/_`). They work on Windows (Git Bash), macOS and Linux with nothing else to install.

| Hook         | Runs                                                                                        | Blocks when                                        |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pre-commit` | `lint-staged --relative` on the **staged files only** (`lint-staged.config.mjs`):           |                                                    |
|              | `.env*`, `*.env` and `.envrc` files other than `.env.example`: refused                      | a real env file is staged                          |
|              | every file: secretlint, also on files forced past `.gitignore`                              | a secret is found                                  |
|              | `*.ts, *.tsx, *.js, *.mjs, *.cjs, *.astro`: `eslint --fix`, then `prettier --write`         | a lint error cannot be fixed automatically         |
|              | `*.json, *.md, *.yml, *.yaml`: `prettier --write`                                           |                                                    |
|              | migrations: `scripts/check-migrations.mjs` ([database.md](database.md#expand-and-contract)) | a contract step has no `-- contract:` reason       |
| `commit-msg` | `commitlint` ([commits.md](commits.md))                                                     | the message is not a Conventional Commit           |
| `pre-push`   | `scripts/git/pre-push.mjs`: refuses pushes to `main`/`master` and badly named branches      | pushing to a protected branch, branch name invalid |
|              | `pnpm typecheck`: every package, the contract types and the typed routes included           | type errors, a stale `schema.d.ts`                 |
|              | `pnpm test`: the app's, the API's and the landing's unit and component tests                | a failing test, a stale `openapi.json`             |

The pre-commit takes seconds for a typical commit (every staged file is linted with type
information); the pre-push about a minute, most of it the app's Jest suite. Both grow with the code
base: keep the hooks to these fast checks.

Not in hooks, on purpose (too slow or need services): integration and end-to-end tests (Maestro,
Playwright), coverage, expo-doctor, the dependency audit, the scan of every file in the repository
(`pnpm secrets:scan`), the builds and their budgets, the images, the infrastructure and
observability checks. CI runs all of them on every pull request; run `pnpm verify` locally before
asking for review.

## Bypassing

`git commit --no-verify` / `git push --no-verify` skip the hooks. Use them only for the very first
push of a new repository (`git push --no-verify -u origin main`, when `main` must be created) or a
real emergency, and say so in the pull request. CI runs the same checks and more, so a bypass never
skips a gate, it only delays the feedback.

## Troubleshooting

- Hooks do not run: `pnpm install` again (sets `core.hooksPath`), or check
  `git config core.hooksPath`.
- `HUSKY=0` disables them (CI and Docker builds set it).
- A hook needs the dependencies installed and Node.js on `PATH` (the version in `.nvmrc`).
- A pre-commit with many staged files on Windows: the hook splits the file list under the
  command-line limit (`--max-arg-length 6000`, `.husky/pre-commit`).
