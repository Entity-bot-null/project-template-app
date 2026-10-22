# 0010. Refuse app versions below a configured minimum, in the API, with 426

- **Status:** Accepted; the app's side shipped later (the headers, the `upgradeRequired` kind and
  the update screen: [releases.md](../releases.md#minimum-supported-version))
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

An installed app is not updated with the API. A store release reaches users over days of review
and staged rollout, a device with automatic updates turned off keeps the old version until its
owner updates by hand, and an OTA update reaches only the builds of its runtime version, and only
when they download it. The API, meanwhile, deploys at once. When a
release must stop old versions (a security fix, a contract change older apps cannot handle, a store
policy), the stores cannot force the update: the backend has to refuse those versions, and the app
has to turn that refusal into an "update the app" screen.

[releases.md](../releases.md#minimum-supported-version) describes that mechanism and left it
pending: the template had no backend to enforce it. The API is now part of the repository
(`apps/api`), so its side ships here; the app's side is the app's to add.

## Options

1. **Store-forced updates only:** the App Store cannot force an update; Google Play's in-app
   updates need a library with native code and work only for installs from Play. Neither tells the
   API anything, so an old version keeps calling it.
2. **expo-updates' runtime version:** it keeps OTA updates compatible with the binary they reach;
   it says nothing to the API and cannot stop an old binary from calling it.
3. **A version endpoint the app polls** (the minimum, read at launch): the decision lives on the
   client, so a version offline at launch keeps calling the API, every launch costs a request, and
   nothing is enforced on the requests themselves.
4. **A gate in the API:** the app names its platform and version on every request; the API refuses
   versions below a minimum kept in its own configuration, before anything else runs.

## Decision

Option 4: middleware `appVersionGate` (`apps/api/src/common/http/app-version.middleware.ts`),
registered in `apps/api/src/app.setup.ts` right after the `Cache-Control` header.

- **Headers:** `X-App-Platform: ios | android` (case-insensitive) and `X-App-Version`, the version
  the store shows. Versions are read as 1 to 3 numbers (the missing ones 0), with an optional
  pre-release or build suffix that is ignored (`2.1.3-rc.1` and `2.1.3+45` read as 2.1.3), and
  compared numerically, part by part.
- **Minimums:** `MOBILE_MIN_VERSION_IOS` and `MOBILE_MIN_VERSION_ANDROID`, in the API's environment
  (`major.minor.patch`). Unset, the gate is off for that platform.
- **The answer:** a request from the app below its platform's minimum gets **426**
  `{ data: null, message: "This version of the app is no longer supported: update it to continue" }`
  before any other check: authentication, rate limits, validation. It is not counted against the
  rate limits, so an updated app signs in at once. Once a minimum is set, a request from the app
  without a version the API can read (missing or malformed) is refused the same way.
- **Exempt:** the probes (`/api/health/*`) and requests without a recognized `X-App-Platform` (curl,
  probes, other clients).
- **Status code:** 426 is a status nothing else in the API produces, so the app can map it to one
  error kind from the status alone. HTTP defines it for a protocol upgrade and expects an `Upgrade`
  header naming the protocol; the API sends none, since no protocol applies.
- **Visibility:** each refusal counts in the metric `app.client.outdated` (a counter with the
  attribute `app.platform`; `app_client_outdated_total{app_platform}` in Prometheus). Every route
  but the probes documents 426 in the contract (`apps/api/src/openapi/openapi.spec.ts` checks it),
  and the contract's description tells clients to send both headers.
- It is a compatibility gate, not a security control: any client can send any header.

## Consequences

- Contract changes stay additive (new routes, new optional fields): installed versions keep
  working. An incompatible change ships either with a raised minimum, once the version that handles
  it has reached most users (store rollout at 100 % and a few days), or under a versioned route that
  old versions keep calling until they are retired.
- Raising a minimum is a change of the API's environment, applied when the API restarts; no app
  release is needed. The same lever retires an OTA runtime version: builds that can no longer get
  fixes are sent to the store.
- The app's part: send both headers on every request (`apps/mobile/src/api/http.ts`, the version
  from `expo-application`), and turn 426 into an error kind that is not retried and a blocking
  "update the app" screen with the store link
  ([releases.md](../releases.md#minimum-supported-version)). Until the app sends the headers, its
  requests carry no `X-App-Platform` and pass the gate whatever the minimum.
- A version that never sent the headers can never be stopped by this gate: the first release that
  sends them is the oldest one a minimum can refuse.
- Tests: `apps/api/src/common/http/app-version.middleware.spec.ts` (parsing, comparison, exemptions)
  and `apps/api/src/common/http/app-version.int.spec.ts` (426 before authentication and validation,
  no rate limit counted).
- Wrong if projects need to refuse by more than platform and version (a build number, a region, a
  share of users), or if a minimum in the API's environment proves too slow to change: then move it
  to a configuration the API reads at run time, keeping the same headers and status.
