# Definition of Done

A change is done when every item that applies is true. "Not applicable" is a valid answer; "not
checked" is not. The pull request template repeats the essentials as a checklist.

## Functionality

- [ ] The acceptance criteria of the issue are met, and the product owner (or the issue's author)
      has seen it working.
- [ ] Every screen touched handles loading, empty, error and offline states, and recovers (retry,
      pull to refresh) without restarting the app.
- [ ] Interrupted flows behave: backgrounding the app mid-request, a lost connection, a session that
      expires while the screen is open, a double tap on submit.

## Quality

- [ ] `pnpm verify` passes: format, lint, types (contract included), tests with coverage, expo
      doctor, security, bundle budget.
- [ ] Tests cover the change: unit tests for logic, component tests for new UI, an integration test
      (screen → hook → API client → stubbed API) for data flows, a Maestro flow for a new or changed
      critical journey.
- [ ] A bug fix comes with the test that failed before the fix.
- [ ] No new `eslint-disable`, `nosemgrep`, `@ts-expect-error` or type assertion without its reason.
- [ ] CI is green; the E2E workflow is green when the change touches a critical flow.

## Devices and platforms

- [ ] Tried on Android and on iOS (device, emulator or simulator), in a release-like build for
      performance-sensitive changes.
- [ ] Works on a small phone and with the largest system font size; nothing clipped or overlapping.
- [ ] Light and dark mode.
- [ ] Safe areas respected (notches, home indicator, Android navigation bar); the keyboard never
      hides the focused field.
- [ ] Android back button and iOS swipe-back go where the user expects.

## Accessibility

- [ ] Every interactive element has a role and an accessible name; images are labeled or decorative;
      new screens are in `src/a11y.spec.tsx` ([docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md#checklist-for-every-feature)).
- [ ] Messages that appear without navigation (errors, results, status) use `AlertText`, so screen
      readers announce them on both platforms.
- [ ] Touch targets of at least 48 dp; contrast from the theme tokens (no new color literals).
- [ ] Usable with TalkBack and VoiceOver: reading order, headings, announced errors and busy states.

## Security and privacy

- [ ] No secret in the code, the bundle (`EXPO_PUBLIC_*`) or git.
- [ ] No tokens, passwords or personal data in logs, breadcrumbs, error reports or analytics events.
- [ ] Sensitive data only in secure storage, and cleared at sign-out.
- [ ] External input validated: API responses (Zod), links (allowlist), notification payloads, route
      parameters.
- [ ] New permissions asked in context, declared in `app.config.ts` with their usage text, and
      reflected in the store privacy declarations ([docs/STORE_COMPLIANCE.md](docs/STORE_COMPLIANCE.md)).
- [ ] New data the app keeps or sends has its row in the data inventory
      ([SECURITY.md](SECURITY.md#data-inventory)), and anything stored per user is cleared at sign-out.
- [ ] New dependencies justified, installed with `expo install`, license and source policy passing.

## Contract, configuration and release

- [ ] API changes: `openapi/openapi.json` updated, types regenerated (`pnpm contract`), and the change
      is backwards compatible with app versions already installed (or coordinated with the backend).
- [ ] New environment variables in `src/config/env.schema.ts`, `.env.example`,
      docs/RELEASES.md#environment-variables and each EAS environment.
- [ ] Release impact identified: OTA-compatible (JavaScript only) or store build (native change).
- [ ] Stored data from the previous version still loads (preferences schema, storage keys), or is
      migrated.
- [ ] Feature flag in place if the feature must ship dark or roll out gradually.
- [ ] Analytics events and error reporting cover the new flow, so its use and failures are visible.

## Documentation and delivery

- [ ] Docs updated where behavior, setup or commands changed (README, docs/, an ADR for a
      significant decision).
- [ ] Breaking changes marked in the pull request title (`!`) and explained in a `BREAKING CHANGE:`
      footer.
- [ ] Reviewed and approved (code owners for their paths); squash-merged with a Conventional Commit
      title.
