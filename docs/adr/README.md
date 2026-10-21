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

| ADR                           | Decision                                                |
| ----------------------------- | ------------------------------------------------------- |
| [0001](0001-stack.md)         | The stack: Expo, its libraries, and what was ruled out  |
| [0002](0002-pnpm-monorepo.md) | The repository is a pnpm workspace, one package per app |
