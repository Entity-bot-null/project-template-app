# Security policy

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [Supported versions](#supported-versions)
- [Threat model](#threat-model)
- [OWASP MASVS](#owasp-masvs)
- [Secrets](#secrets)
- [Storage](#storage)
- [Network](#network)
- [Logging and reports](#logging-and-reports)
- [Platform hardening](#platform-hardening)
- [Advanced device controls](#advanced-device-controls)
- [Dependencies](#dependencies)
- [Known advisories](#known-advisories)
- [Dependency policy](#dependency-policy)
- [Static analysis](#static-analysis)
- [Release integrity](#release-integrity)

## Reporting a vulnerability

Please report vulnerabilities **privately**, never in a public issue, pull request or discussion:

- GitHub: **Security → Report a vulnerability** on this repository (private vulnerability
  reporting), or
- Email: `security@example.com` <!-- REQUIERE CONFIGURACIÓN: replace with a monitored address -->

Include what you found, how to reproduce it, the app version and build (Settings → About), the
device and OS, and the impact you expect. Do not access, modify or delete data that is not yours,
and do not run denial-of-service tests against the API.

We acknowledge reports within **3 working days**, keep you informed while we fix the issue, and
credit you in the advisory if you wish. <!-- REQUIERE CONFIGURACIÓN: adjust the response times -->

## Supported versions

The latest store release receives fixes. Fixes in JavaScript reach installed builds of supported
runtime versions as OTA updates; native fixes need a store release, and a minimum supported version
enforced by the API (an "update required" answer) for vulnerabilities that cannot wait for users to
update ([docs/RELEASES.md](docs/RELEASES.md#minimum-supported-version), REQUIRES CONFIGURATION). Each release lists its dependencies in the SBOM attached to its GitHub release.

## Threat model

A mobile app runs on a device the publisher does not control. What follows from that:

- **The app and everything in it are public.** The binary, the JavaScript bundle and every
  `EXPO_PUBLIC_*` value can be extracted and read. No secret can be kept in the app: authorization
  happens on the server, always.
- **The device may be lost, shared, backed up or compromised.** Credentials are stored in the
  platform's secure storage, sessions can be ended server-side, and nothing sensitive goes into
  plain storage, logs or backups.
- **Input from outside is untrusted**: deep links, notification payloads, API responses (a proxy,
  an old server, a bug), clipboard. Everything is validated before use.
- **The network is hostile**: HTTPS only, no cleartext outside local development.

## OWASP MASVS

How the template addresses the [OWASP Mobile Application Security Verification
Standard](https://mas.owasp.org/MASVS/) (v2). Testing guidance: the OWASP MASTG.

| Control group    | In the template                                                                                                                                                                               | Project's responsibility                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| MASVS-STORAGE    | refresh token in Keychain/Keystore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), access token in memory only, no AsyncStorage, Android backups off, caches cleared at sign-out, no secrets in logs | classify new data before storing it ([Storage](#storage))                                                                     |
| MASVS-CRYPTO     | no custom cryptography: platform keystores and TLS                                                                                                                                            | use platform APIs (`expo-crypto`, keystore) if cryptography is needed                                                         |
| MASVS-AUTH       | server-side sessions, rotating single-use refresh tokens, renewal race handling, sign-out on server rejection, keychain wipe on fresh install                                                 | enforce authorization, refresh token reuse detection and revocation on the server; MFA and biometrics as the product requires |
| MASVS-NETWORK    | HTTPS required outside localhost (validated at build and startup), cleartext refused in Android release builds, timeouts                                                                      | TLS configuration of the API; certificate pinning if the threat model requires it ([below](#advanced-device-controls))        |
| MASVS-PLATFORM   | deep link allowlist with parameter validation, links never perform actions, notification URLs validated, permissions asked in context, minimal declared permissions, no WebView               | review new permissions, intents, WebViews (if added: no JavaScript bridges to untrusted content)                              |
| MASVS-CODE       | strict TypeScript, Zod validation of every external input, dependency policy and audits, SDK kept current, R8 on Android                                                                      | keep dependencies and the SDK updated; enforce a minimum app version server-side                                              |
| MASVS-RESILIENCE | Hermes bytecode and R8 minification (not protections, only cost for an attacker)                                                                                                              | add attestation or tamper detection only with server-side verification ([below](#advanced-device-controls))                   |
| MASVS-PRIVACY    | analytics only after consent, opaque user ids, no personal data in events or reports, `sendDefaultPii` off, screenshots of reports off                                                        | privacy policy, App Store privacy labels, Play data safety, data deletion requests                                            |

## Secrets

- **No secret in the app.** `EXPO_PUBLIC_*` variables are compiled into the bundle: URLs, a Sentry
  DSN (designed to be public), flags. API keys with write access, signing keys, tokens of
  third-party services stay on the server; the app calls the API, which calls the third party.
- **No secret in git.** `.env` files are git-ignored and refused by the pre-commit hook
  (`scripts/forbid-env-files.mjs`); only `.env.example` with placeholders is committed. Signing
  material and service account files are git-ignored by pattern. secretlint scans staged files on
  every commit and the whole tree in CI; gitleaks scans the full history in CI.
- **Where secrets live**: signing credentials and store/push keys on EAS (`eas credentials`);
  build-time secrets (`SENTRY_AUTH_TOKEN`) as EAS environment variables of visibility `secret`;
  CI tokens (`EXPO_TOKEN`) as secrets of protected GitHub environments
  ([docs/CI_CD.md](docs/CI_CD.md#secrets-and-variables)).
- A leaked secret is revoked and rotated first, then removed from history; removing it from git
  alone does not make it secret again.

## Storage

Choose the storage by what the data is ([docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md#storage)):

| Data                                            | Where                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Refresh token, other credentials                | `secureStorage` (Keychain / Android Keystore)                   |
| Access token                                    | memory only                                                     |
| Preferences, onboarding, consent                | `persistentStorage` (SQLite, private to the app, not encrypted) |
| Server data                                     | TanStack Query's in-memory cache, cleared at sign-out           |
| Passwords                                       | nowhere: sent to the API once, never stored                     |
| Personal data cached for offline use (if added) | encrypted storage, cleared at sign-out, excluded from backups   |

SecureStore is for small secrets, not for bulk data. The installation marker in persistent storage
lets the app wipe a session the iOS Keychain kept from a previous installation.

### Data inventory

Every piece of data the app keeps or sends, as the template ships. A feature that adds data adds
its row, and the store privacy forms follow this table ([docs/STORE_COMPLIANCE.md](docs/STORE_COMPLIANCE.md)).

| Data                                                   | Sensitivity                                                             | Where                                                                          | Encrypted at rest                     | Kept until                                             | Deleted at sign-out                                      | Survives uninstall                                                                                         | In analytics                                 | In crash reports                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Refresh token                                          | secret                                                                  | SecureStore: Keychain / Android Keystore, this device only, after first unlock | yes (platform keystore)               | sign-out, a refused renewal; replaced at every renewal | yes                                                      | iOS Keychain may keep it: wiped at the first launch of a new installation (`session.spec.ts`); Android: no | never                                        | never (redacted)                                       |
| Access token                                           | secret                                                                  | memory                                                                         | n/a                                   | its expiry, or the process                             | yes                                                      | no                                                                                                         | never                                        | never (redacted)                                       |
| Password                                               | secret                                                                  | nowhere: sent once to the API                                                  | n/a                                   | —                                                      | —                                                        | —                                                                                                          | never                                        | never (redacted)                                       |
| Installation marker                                    | none (no personal data)                                                 | SQLite key-value store                                                         | no (app sandbox)                      | uninstall                                              | no                                                       | no                                                                                                         | no                                           | no                                                     |
| Preferences: theme, onboarding done, analytics consent | low                                                                     | SQLite key-value store                                                         | no (app sandbox; Android backups off) | uninstall                                              | no (device settings, not the user's)                     | no                                                                                                         | the theme as an event property, with consent | no                                                     |
| Server data: profile, items                            | personal (depends on the product)                                       | TanStack Query cache, memory only                                              | n/a                                   | the process; 5 minutes after its screen closes         | yes                                                      | no                                                                                                         | no                                           | no (breadcrumbs keep paths and statuses, never bodies) |
| Images                                                 | depends on the product                                                  | `expo-image` memory and disk cache (the app's cache folder)                    | no                                    | evicted by size or by the system                       | yes (both caches)                                        | no                                                                                                         | no                                           | no                                                     |
| OTA updates                                            | none                                                                    | expo-updates files in the app's storage                                        | no                                    | replaced by newer updates or a new binary              | no                                                       | no                                                                                                         | no                                           | no                                                     |
| Push token                                             | device identifier                                                       | not stored by the app; the backend's registration (REQUIERE CONFIGURACIÓN)     | —                                     | the backend's policy                                   | the backend's job (MOBILE_ARCHITECTURE.md#notifications) | —                                                                                                          | never                                        | never                                                  |
| Error reports                                          | an opaque user id, release, device model and OS, breadcrumbs, the error | Sentry (queued on the device while offline)                                    | in transit (TLS)                      | the Sentry project's retention                         | the user id is cleared                                   | queued events: no                                                                                          | —                                            | —                                                      |
| Analytics events                                       | an opaque user id, event names, enums, route patterns                   | the provider (none ships: REQUIERE CONFIGURACIÓN)                              | in transit                            | the provider's retention                               | the identity is reset                                    | no                                                                                                         | —                                            | —                                                      |
| Logs                                                   | development only                                                        | the developer's terminal; in release builds only breadcrumbs                   | —                                     | —                                                      | —                                                        | —                                                                                                          | —                                            | as breadcrumbs, redacted                               |

**No personal data in telemetry** (analytics, error reports, logs) unless a product requirement
justifies it, it is configured on purpose, declared in the store privacy forms and covered by the
privacy policy. Identifiers are opaque ids, never emails or names.

## Network

- HTTPS only: `src/config/env.schema.ts` rejects `http://` URLs except localhost and the Android
  emulator host, and requires HTTPS in production; Android release builds disallow cleartext
  (`usesCleartextTraffic` is only enabled for the `e2e` variant against the local mock API); iOS
  App Transport Security stays at its default.
- Every request has a timeout and a request id; tokens are sent only to the configured API.
- API responses are validated with Zod before use.

## Logging and reports

Nothing that identifies a user or grants access leaves the device in logs, breadcrumbs, error
reports or analytics:

- `src/lib/observability/redact.ts` replaces values under sensitive keys (`password`, `token`,
  `authorization`, `cookie`, `secret`, `apiKey`, …), masks emails and bearer tokens in text, and
  drops query strings from URLs; Sentry events and breadcrumbs pass through it (`scrubEvent`,
  `scrubBreadcrumb`).
- Sentry: `sendDefaultPii` off, no screenshots or view hierarchies attached, failed HTTP requests
  not captured with bodies; users identified by opaque id only.
- Analytics: only after consent; events carry enums, counts and ids, never free text.
- `console.log` is not allowed in app code; `logger` prints in development only.

## Platform hardening

Configured in `app.config.ts`:

- Android: `allowBackup` off (no adb or cloud backup of app data); only the permissions the app uses,
  and `blockedPermissions` for ones libraries add but the app does not need
  (`SYSTEM_ALERT_WINDOW`, external storage); R8 minification and resource shrinking in release
  builds; App Links verified (`autoVerify`) when a link domain is configured.
- iOS: universal links through associated domains (verified by Apple against the domain); the
  export compliance flag set for HTTPS-only encryption (review it if the app adds cryptography); no
  Face ID usage text, since nothing uses biometrics (`expo-secure-store` with
  `faceIDPermission: false`). The one other usage text, local network, comes from the development
  client and is never prompted in release builds ([docs/STORE_COMPLIANCE.md](docs/STORE_COMPLIANCE.md)).
- Both: separate application ids per variant, so development and test builds can never overwrite
  or read a production installation's data.

## Advanced device controls

**Absolute rule: the mobile client is never the only authority for authorization or for any
security-critical decision.** Everything in the app, its checks included, can be read, modified
and replayed by someone who controls the device. The controls below raise the cost of an attack or
give the server evidence about the client; the **server** decides.

None is enabled by default, and none is faked: each one only works with the server-side half and a
threat model that calls for it. All are **OPTIONAL / PROJECT-SPECIFIC**.

| Control                                 | Consider it when                                                                                                     | Threat it addresses                                                                         | What it does not solve                                                                                              | What the backend must verify                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Certificate pinning**                 | high-value traffic (payments, health) on networks you do not trust, and the team can operate key rotation            | a man-in-the-middle with a certificate the device trusts (a corporate or malicious root CA) | a compromised device or a modified app (pinning is removed in minutes on a rooted phone); a server-side breach      | nothing per request; operate the pins: a backup key, rotation before expiry, and a server-driven way to relax pinning, since a wrong pin locks every user out until they update |
| **Apple App Attest** (iOS 14+)          | the API must know a request comes from a genuine copy of your app on a genuine Apple device (fraud, bots, API abuse) | scripted clients, modified apps, emulators calling the API                                  | a genuine app on a jailbroken device driven by an attacker; account takeover with stolen credentials                | the attestation once per key (certificate chain, app id, counter) and an assertion on each sensitive request; keep the key's counter; decide what failing devices may still do  |
| **Apple DeviceCheck**                   | you need a few bits of per-device state that survive reinstalls (a free trial or promotion claimed once)             | the same device claiming something again after reinstalling                                 | anything about the app's integrity                                                                                  | read and set the two bits server-to-server with Apple; the app only sends a token                                                                                               |
| **Google Play Integrity**               | the Android counterpart of App Attest (and licensing)                                                                | modified apps, unknown installers, emulators, devices that fail integrity                   | an attacker on a device that passes; bugs in your own authorization                                                 | decrypt and check the verdict on the server (app recognized, device integrity, request nonce/hash, timestamp); never trust a verdict checked only on the device                 |
| **Root / jailbreak detection**          | a regulation asks for it, or as one input to risk scoring                                                            | casual tampering on compromised devices                                                     | a determined attacker (detection is bypassed on the device it inspects); used alone it is a false sense of security | treat it as a signal sent to the server alongside attestation, not as a gate in the app                                                                                         |
| **Biometric unlock**                    | users want quick re-entry, or the product must confirm presence before a sensitive action                            | someone else picking up an unlocked phone                                                   | phishing, server-side account takeover; it is not a second factor for the server                                    | step-up actions still need a server-verified factor (or an App Attest/Play Integrity-backed assertion); keep the refresh token's own expiry and rotation                        |
| **Hardware-backed keys**                | the app must prove possession of a device-bound key (request signing, passkeys, step-up)                             | stolen tokens replayed from another device                                                  | a compromised device signing on the attacker's behalf                                                               | register the public key per device, verify signatures (and counters), revoke at sign-out                                                                                        |
| **Screenshot / screen-recording block** | specific screens show data that must not end up in screenshots or the app switcher                                   | shoulder surfing, screenshots synced to the cloud                                           | a photo of the screen; it hurts accessibility and support                                                           | nothing                                                                                                                                                                         |
| **Code obfuscation**                    | not recommended as a security control                                                                                | slows down reading the app                                                                  | everything: Hermes bytecode and R8 already raise the cost; secrets must not be in the app anyway                    | nothing                                                                                                                                                                         |

How to add each one, when the decision is made: certificate pinning through a config plugin that
writes the platform's pinning configuration (with a backup key); App Attest and Play Integrity
through a maintained module with a config plugin and the server verification above; biometrics with
`expo-local-authentication` and SecureStore's `requireAuthentication` (then give `expo-secure-store`
a `faceIDPermission` text in `app.config.ts`); screenshot blocking with `expo-screen-capture` on the
screens that need it. Each one is a native change: a new store build
([docs/RELEASES.md](docs/RELEASES.md#what-can-ship-as-an-ota-update)).

## Dependencies

- Installed with pnpm under supply-chain settings (`pnpm-workspace.yaml`): a release must be at
  least **seven days old** (`minimumReleaseAge`), a package whose provenance or trust level drops
  is refused (`trustPolicy: no-downgrade`), transitive dependencies from outside the registry are
  refused (`blockExoticSubdeps`), and **no install script runs** unless listed in `allowBuilds`
  (every entry is `false`, each with its reason).
- For an urgent security fix younger than seven days, exempt that exact version
  (`minimumReleaseAgeExclude: [name@1.2.3]`, never a name or a pattern) and record it in
  `scripts/dependency-policy.json` with its reason and `expires`, the date the version is old
  enough. From that date `pnpm deps:check` fails until both entries are deleted.
- `pnpm audit --audit-level=high` in `pnpm security` and CI; Dependabot security updates.
- Expo SDK packages move together through SDK upgrades; Dependabot proposes their patches only.
- Every release carries a CycloneDX SBOM of the production dependencies (`pnpm sbom:generate`).
- A new dependency is justified in its pull request: maintained, New Architecture compatible,
  license allowed, smallest reasonable footprint (bundle and binary).

## Known advisories

`pnpm audit --audit-level=high` runs in `pnpm security` and CI. When an advisory cannot be fixed
yet, it is handled in the open, in `pnpm-workspace.yaml`, never by lowering the audit level:

| Advisory                                            | Package (path)                                       | Handling                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-pqg4-j6r4-53mv (critical)                      | shell-quote (`react-devtools-core` in React Native)  | fixed: `overrides` forces 1.11.0 or later; remove the override once React Native's tree resolves it without                                                                                                                                                           |
| GHSA-68fv-2mgg-jv7q (high)                          | source-map-js (postcss in Expo's Metro config)       | fixed: `overrides` forces 1.2.2; remove the override once Expo's tree resolves it without                                                                                                                                                                             |
| GHSA-86w9-cpqp-85rv (high)                          | node-forge (`@expo/cli` update code-signing helpers) | `audit.ignore`: no fixed version exists; development tool, not in the app binary                                                                                                                                                                                      |
| GHSA-vfj7-8cjw-p6xm (high)                          | braces (Metro's file watcher)                        | `audit.ignore`: no fixed version exists; build tool fed by the project's own configuration                                                                                                                                                                            |
| GHSA-vcc3-ghjq-m6fr (moderate)                      | decode-uri-component (`query-string` in Expo Router) | in the app; the fix (0.5.0) is incompatible with the version range Expo Router requires. Mitigated: every incoming link passes the allowlist of `src/lib/links.ts` (query strings dropped, path parameters restricted to `[A-Za-z0-9_-]`) before the router parses it |
| GHSA-w5hq-g745-h8pq, GHSA-hp3w-g68c-fv3c (moderate) | uuid (`xcode`, prebuild), sprintf-js (Jest coverage) | build and test tools only                                                                                                                                                                                                                                             |

`pnpm deps:check` prints the ignored advisories and the release-age exemptions on every run. Each
entry is removed as soon as a fix ships; the Expo SDK upgrades usually bring them. A release-age
exemption also fails the check from its expiry date on.

## Dependency policy

`scripts/check-dependencies.mjs` (`pnpm deps:check`, part of `pnpm security`) enforces
`scripts/dependency-policy.json`:

- every package comes from the npm registry, with an integrity hash in the lockfile;
- licenses: an allowlist for everything, a wider one for development-only packages, and named
  exceptions with their reason (for example the Sentry CLI, a build-time tool under the Functional
  Source License);
- the supply-chain settings above cannot be weakened without failing the check
  (`scripts/install-settings.mjs`, which reads `pnpm-workspace.yaml` as YAML and fails on what it
  cannot read unambiguously, such as anchors or a key set twice):

| Setting                                        | Fails when                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `minimumReleaseAge`                            | missing or below 10080 minutes (seven days)                                                                                                |
| `minimumReleaseAgeStrict`                      | `false` (pnpm would fall back to a younger version)                                                                                        |
| `minimumReleaseAgeExclude`                     | an entry is a name or a pattern, is not recorded in the policy, or has reached its `expires` date (set at most the delay plus a day ahead) |
| `trustPolicy`, `blockExoticSubdeps`            | not `no-downgrade`, not `true`                                                                                                             |
| `trustPolicyIgnoreAfter`                       | below 43200 minutes (30 days); left out, every version is compared                                                                         |
| `trustPolicyExclude`                           | an entry is not recorded in the policy with its reason                                                                                     |
| `allowBuilds`                                  | an entry is not `false` and not recorded in the policy with its reason                                                                     |
| `dangerouslyAllowAllBuilds`, `strictDepBuilds` | `true` (every install script would run), `false` (an unreviewed build script would no longer stop the install)                             |
| an exception in the policy (any of the above)  | its entry is gone from `pnpm-workspace.yaml`, or it has no reason                                                                          |

Changing the policy is a reviewed decision (CODEOWNERS).

## Static analysis

| Tool                      | Runs                                   | Scope                                                                       |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| TypeScript strict, ESLint | every commit (staged files), CI        | type safety, architecture rules, React and hooks rules                      |
| Semgrep (`pnpm sast`)     | CI, on demand (Docker)                 | curated rulesets: OWASP Top 10, TypeScript, React, Node.js scripts, secrets |
| CodeQL                    | CI, opt-in (`ENABLE_CODEQL`)           | `security-extended` queries                                                 |
| zizmor, actionlint        | CI, `pnpm lint:workflows` (Docker)     | the workflows themselves                                                    |
| secretlint, gitleaks      | pre-commit and CI; gitleaks on history | secrets                                                                     |

Any finding fails. A false positive is suppressed where it occurs with the reason on the same line
(`// nosemgrep: <rule> -- why`), so review sees it.

## Release integrity

- Builds come only from commits on `main` that passed every gate, started by a person through a
  protected GitHub environment ([docs/CI_CD.md](docs/CI_CD.md#what-protects-production)).
- Signing keys never leave EAS; Google Play App Signing holds the Android app signing key.
- OTA updates reach only builds of the same native fingerprint; the production channel is
  protected. For end-to-end verification of updates, enable EAS Update code signing
  (`--private-key-path`, the certificate in `app.config.ts` under `updates.codeSigningCertificate`)
  when the account plan allows it.
