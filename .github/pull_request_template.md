<!--
Title: Conventional Commits, it becomes the commit on main (squash merge).
  feat(items): add item sharing
  fix(auth): keep the session after a refresh race
See CONTRIBUTING.md#commits.
-->

## What and why

<!-- What changes and why. Link the issue: "Closes #123" or the tracker key. -->

## How it was tested

<!-- Tests added or changed; devices and OS versions it was tried on, with
     steps a reviewer can repeat. -->

## Screenshots or recording

<!-- UI changes: light and dark mode, both platforms when they differ. Delete otherwise. -->

## Release impact

- [ ] JavaScript only: can ship as an OTA update.
- [ ] Changes native code or native configuration (a new or upgraded native module, a config plugin, permissions, app.config.ts native fields, the Expo SDK): needs a new store build; the runtime version changes.

<!-- New environment variables, API changes the app depends on, feature flags,
     migrations of stored data. "None" is a valid answer. -->

## Definition of Done (DEFINITION_OF_DONE.md)

- [ ] Acceptance criteria of the issue are met.
- [ ] Tests cover the change: unit and component tests; an integration test (screen → hook → API client → stubbed API) for data flows; a Maestro flow for a new critical journey.
- [ ] `pnpm verify` passes locally; CI is green.
- [ ] Tried on Android and iOS (device or emulator/simulator), small screen included, light and dark mode.
- [ ] Loading, empty, error and offline states handled; nothing blocks the UI thread (long lists virtualized).
- [ ] Accessible (docs/ACCESSIBILITY.md): labels and roles on controls, touch targets of 48 dp, readable with the largest font size, usable with TalkBack/VoiceOver; new screens added to `src/a11y.spec.tsx`.
- [ ] API contract updated in `openapi/openapi.json` and the types regenerated (`pnpm contract`) if the API changed.
- [ ] New environment variables in `src/config/env.schema.ts`, `.env.example` and docs/RELEASES.md#environment-variables; no secret in an `EXPO_PUBLIC_*` variable.
- [ ] Security: no tokens, passwords or personal data in logs, analytics or error reports; sensitive data only in secure storage; links validated (src/lib/links.ts); permissions asked in context.
- [ ] New dependencies justified (maintained, New Architecture compatible, allowed license, `expo install` for SDK packages); no new `nosemgrep`/`eslint-disable` without its reason.
- [ ] Breaking changes marked in the title (`!`) and explained in a `BREAKING CHANGE:` footer.
- [ ] Documentation updated (README, docs/, an ADR for a significant decision).
