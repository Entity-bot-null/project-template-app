# End-to-end flows (Maestro)

The critical journeys of the app, run by [Maestro](https://maestro.mobile.dev) against a release
build of the `e2e` variant (application id `com.example.templateapp.e2e`) and the local mock API
(`pnpm mock:api`). How to build and run them, locally and in CI: [docs/TESTING.md](../docs/TESTING.md#end-to-end).

```
.maestro/
  config.yaml        the workspace: which flows, in which order
  flows/
    01-onboarding-and-sign-in.yaml
    02-session-survives-restart.yaml
    03-items.yaml
    04-deep-links.yaml
    05-sign-out.yaml
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
- The data comes from the mock API: its accounts and items are the fixtures.
- `maestro studio` shows the screen's elements and records commands.
