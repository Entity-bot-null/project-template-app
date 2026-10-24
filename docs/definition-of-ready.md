# Definition of Ready

A story can start when all of these hold. The feature issue template
(`.github/ISSUE_TEMPLATE/feature_request.yml`) asks for each one.

- [ ] **Value:** who it is for and why it matters are written down (the user story).
- [ ] **Acceptance criteria:** observable and testable (Given / When / Then), including errors and
      empty states.
- [ ] **Scope:** what is out of scope is stated.
- [ ] **Screens and states:** designs, and what the user sees while loading, when empty, on error
      and offline.
- [ ] **Access:** which roles may do it, and on which records (ownership rules,
      [authorization.md](authorization.md)).
- [ ] **Contract and data:** API changes and data model changes are sketched (new routes, fields,
      tables, migrations), and every change is additive for the app versions already installed.
- [ ] **Release impact:** whether it needs native code, a new permission or a native module (a
      store build, not an OTA update), a deep link, a notification or a feature flag.
- [ ] **Non-functional needs:** performance on low-end devices, offline behavior, personal data
      involved, accessibility, store policy impact, if any.
- [ ] **Dependencies:** designs, external services, credentials and other stories are available
      or scheduled.
- [ ] **Size:** small enough to finish, review and merge in a few days; otherwise split.

A story that is not ready goes back for refinement instead of starting with open questions.

Done is defined in [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md).
