# End-to-end flows (Maestro)

The critical journeys of the app, run by [Maestro](https://maestro.mobile.dev) against a release
build of the `e2e` variant (application id `com.example.templateapp.e2e`) and the real API
(`pnpm dev`, seeded with `pnpm db:seed`), in two suites: the app's journeys
(`pnpm test:e2e:mobile`) and the account journeys that need email, read from Mailpit
(`pnpm test:e2e:mobile:stack`). Both reach the API through the e2e proxy
(`apps/mobile/scripts/e2e-proxy.mjs`, started by those commands), which fails on demand what a
healthy API never fails. How to build and run them, locally and in CI:
[docs/testing.md](../../../docs/testing.md#end-to-end).

```
.maestro/
  config.yaml        the workspace: which flows, in which order
  flows/
    01-onboarding-and-sign-in.yaml
    02-session-survives-restart.yaml
    03-items.yaml
    04-server-errors.yaml
    05-offline.yaml
    06-session-ends.yaml
    07-deep-links.yaml
    08-sign-out.yaml
  stack/             the suite against the real API: its own config.yaml
    account-journeys.yaml            the one flow: runs the journeys below in order, on one account
    journeys/
      01-sign-up.yaml
      02-change-email.yaml
      03-password-recovery.yaml
      04-delete-account.yaml
    helpers/open-emailed-link.yaml   waits for a link in Mailpit, then opens it (runFlow)
    helpers/wait-for-mail-window.yaml  waits out the API's one message a minute per address
  scripts/
    e2e-proxy.js     makes the e2e proxy fail on demand (runScript)
    mailpit-link.js  the newest link the API emailed to an address (runScript)
  results/           reports, screenshots and logs of the last run (git-ignored)
```

The flows run in order and share the installed app's state: the first one starts from a clean
install (`clearState`, `clearKeychain`) and each following one continues where the previous one
ended, like a user's first session. The first failure stops the sequence.

A new flow gets a `name:` and goes into `flowsOrder` in `config.yaml` **by that name** (not its file
name): Maestro matches named flows by name, and a list it cannot match is silently run as an
unordered set that ignores `continueOnFailure`.

- The application id and URL scheme are the `e2e` variant's: after changing the identity in
  `app.config.ts`, update `APP_ID` and `SCHEME` in the flows' `env` (or pass
  `-e APP_ID=… -e SCHEME=…` to `maestro test`).
- Elements are found by `testID` (`id:`) or visible text. Wait with `extendedWaitUntil`, never with
  fixed sleeps.
- The data comes from the API's database: the seed's accounts and items are the fixtures
  (`pnpm db:seed` before a run puts the member's 45 items back and removes the ones earlier runs
  created). The stack suite signs up a new address on every run (`e2e-<time>@example.test`): the
  API's database keeps the earlier ones.
- Failures come from the e2e proxy: `scripts/e2e-proxy.js` sets a status (429, 5xx, or no answer
  at all) for a route, or expires or revokes every session (the API then refuses the tokens
  itself). A flow that sets a fault clears it in `onFlowComplete`, so the next flow starts against
  a working API even when this one fails.
- `maestro studio` shows the screen's elements and records commands.
