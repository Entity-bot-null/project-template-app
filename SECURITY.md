# Security policy

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [Supported versions](#supported-versions)
- [Threat model](#threat-model)
- [The API](#the-api)
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
enforced by the API for vulnerabilities that cannot wait for users to update: below
`MOBILE_MIN_VERSION_<PLATFORM>` every request from the app answers 426
([docs/adr/0010-minimum-supported-app-version.md](docs/adr/0010-minimum-supported-app-version.md);
the app's side: [docs/releases.md](docs/releases.md#minimum-supported-version)). The API runs one
version at a time: the latest deployed. Each release lists its npm dependencies in the SBOM attached
to its GitHub release.

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

## The API

The API (`apps/api`) is where every authorization decision happens. Its design, in detail, is in
[docs/security.md](docs/security.md): sessions with rotating refresh tokens sent in the body and
family revocation on reuse ([ADR 0007](docs/adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md)),
access tokens ended at once by a password change, argon2 password hashing and policy, object-level
authorization in every query, rate limits that count a person or an account rather than a shared
carrier address, validated input, one-time links hashed at rest, an email outbox that never leaks
whether an account exists, account deletion ([ADR 0012](docs/adr/0012-account-deletion.md)),
redacted logs and error reports, and its own supply chain checks (the images scanned by Trivy).

## OWASP MASVS

How the template addresses the [OWASP Mobile Application Security Verification
Standard](https://mas.owasp.org/MASVS/) (v2). Testing guidance: the OWASP MASTG.

| Control group    | In the template                                                                                                                                                                                                                                                                                                       | Project's responsibility                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| MASVS-STORAGE    | refresh token in Keychain/Keystore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), access token in memory only, no AsyncStorage, Android backups off, caches cleared at sign-out, no secrets in logs                                                                                                                         | classify new data before storing it ([Storage](#storage))                                                              |
| MASVS-CRYPTO     | no custom cryptography: platform keystores and TLS                                                                                                                                                                                                                                                                    | use platform APIs (`expo-crypto`, keystore) if cryptography is needed                                                  |
| MASVS-AUTH       | server-side sessions, rotating single-use refresh tokens, renewal race handling, sign-out on server rejection, keychain wipe on fresh install; in the API: authorization in every query, refresh token reuse detection with family revocation, `securityVersion` revocation of access tokens, rate limits per account | MFA and biometrics as the product requires; the authorization rules of each new feature                                |
| MASVS-NETWORK    | HTTPS required outside localhost (validated at build and startup), cleartext refused in Android release builds, timeouts                                                                                                                                                                                              | TLS configuration of the API; certificate pinning if the threat model requires it ([below](#advanced-device-controls)) |
| MASVS-PLATFORM   | deep link allowlist with parameter validation, links never perform actions, notification URLs validated, permissions asked in context, minimal declared permissions, no WebView                                                                                                                                       | review new permissions, intents, WebViews (if added: no JavaScript bridges to untrusted content)                       |
| MASVS-CODE       | strict TypeScript, Zod validation of every external input, dependency policy and audits, SDK kept current, R8 on Android; the API's minimum app version (426)                                                                                                                                                         | keep dependencies and the SDK updated; raise the minimum app version when a vulnerable release must stop being served  |
| MASVS-RESILIENCE | Hermes bytecode and R8 minification (not protections, only cost for an attacker)                                                                                                                                                                                                                                      | add attestation or tamper detection only with server-side verification ([below](#advanced-device-controls))            |
| MASVS-PRIVACY    | analytics only after consent, opaque user ids, no personal data in events or reports, `sendDefaultPii` off, screenshots of reports off; account deletion in the API                                                                                                                                                   | privacy policy, App Store privacy labels, Play data safety, a deletion request path outside the app                    |

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
  ([docs/ci-cd.md](docs/ci-cd.md#secrets-and-variables)).
- A leaked secret is revoked and rotated first, then removed from history; removing it from git
  alone does not make it secret again.

## Storage

Choose the storage by what the data is
([docs/mobile-architecture.md](docs/mobile-architecture.md#storage)):

| Data                                            | Where                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Refresh token, other credentials                | `secureStorage` (Keychain / Android Keystore)                   |
| Access token                                    | memory only                                                     |
| Preferences, onboarding, consent                | `persistentStorage` (SQLite, private to the app, not encrypted) |
| Server data                                     | TanStack Query's in-memory cache, cleared at sign-out           |
| Passwords                                       | nowhere: sent to the API once, never stored                     |
| Personal data cached for offline use (if added) | encrypted storage, cleared at sign-out, excluded from backups   |

SecureStore is for small secrets, not for bulk data. The installation marker in persistent storage
lets the app wipe a session the iOS Keychain kept from a previous installation. The push installation
id there names this installation to the API's devices: a random UUID, not personal.

### Data inventory

Every piece of data the app keeps or sends, as the template ships. A feature that adds data adds its
row, and the store privacy forms follow this table
([docs/store-compliance.md](docs/store-compliance.md)).

| Data                                                   | Sensitivity                                                             | Where                                                                                  | Encrypted at rest                     | Kept until                                             | Deleted at sign-out                            | Survives uninstall                                                                                         | In analytics                                 | In crash reports                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Refresh token                                          | secret                                                                  | SecureStore: Keychain / Android Keystore, this device only, after first unlock         | yes (platform keystore)               | sign-out, a refused renewal; replaced at every renewal | yes                                            | iOS Keychain may keep it: wiped at the first launch of a new installation (`session.spec.ts`); Android: no | never                                        | never (redacted)                                       |
| Access token                                           | secret                                                                  | memory                                                                                 | n/a                                   | its expiry, or the process                             | yes                                            | no                                                                                                         | never                                        | never (redacted)                                       |
| Password                                               | secret                                                                  | nowhere: sent once to the API                                                          | n/a                                   | —                                                      | —                                              | —                                                                                                          | never                                        | never (redacted)                                       |
| Signed-in user: id, email, name, role                  | personal                                                                | memory (the session store), from every sign-in and renewal                             | n/a                                   | sign-out, or the process                               | yes                                            | no                                                                                                         | the opaque id only, with consent             | the opaque id only                                     |
| Link token of an emailed link                          | secret (one use)                                                        | memory (`apps/mobile/src/auth/linkTokens.ts`), never in a path or the navigation state | n/a                                   | taken by its screen, or 30 minutes                     | no (not the session's; gone within 30 minutes) | no                                                                                                         | never                                        | never                                                  |
| Account forms: name, email, new email                  | personal                                                                | nowhere: sent once to the API (sign-up, invitation, change of email)                   | n/a                                   | —                                                      | —                                              | —                                                                                                          | never (events carry no values)               | never (redacted)                                       |
| App platform, version and build                        | none (no personal data)                                                 | not stored: sent with every request (`X-App-*` headers)                                | n/a                                   | —                                                      | —                                              | —                                                                                                          | no                                           | the release, as before                                 |
| Idempotency-Key of an item create                      | none (a random UUID)                                                    | memory, while the form that created it stays open; sent with the create                | n/a                                   | the create succeeded, or the form closed               | yes (the form closes)                          | no                                                                                                         | no                                           | no                                                     |
| Installation marker                                    | none (no personal data)                                                 | SQLite key-value store                                                                 | no (app sandbox)                      | uninstall                                              | no                                             | no                                                                                                         | no                                           | no                                                     |
| Push installation id                                   | none (a random UUID: the installation, not the user)                    | SQLite key-value store; in the path of the API's devices                               | no (app sandbox)                      | uninstall                                              | no (the next account registers under it)       | no                                                                                                         | never                                        | never                                                  |
| Preferences: theme, onboarding done, analytics consent | low                                                                     | SQLite key-value store                                                                 | no (app sandbox; Android backups off) | uninstall                                              | no (device settings, not the user's)           | no                                                                                                         | the theme as an event property, with consent | no                                                     |
| Server data: profile, items                            | personal (depends on the product)                                       | TanStack Query cache, memory only                                                      | n/a                                   | the process; 5 minutes after its screen closes         | yes                                            | no                                                                                                         | no                                           | no (breadcrumbs keep paths and statuses, never bodies) |
| Images                                                 | depends on the product                                                  | `expo-image` memory and disk cache (the app's cache folder)                            | no                                    | evicted by size or by the system                       | yes (both caches)                              | no                                                                                                         | no                                           | no                                                     |
| OTA updates                                            | none                                                                    | expo-updates files in the app's storage                                                | no                                    | replaced by newer updates or a new binary              | no                                             | no                                                                                                         | no                                           | no                                                     |
| Push token (Expo)                                      | device identifier                                                       | not stored by the app: sent to the API while signed in, once allowed                   | n/a                                   | the API's (below)                                      | removed from the API first (best effort)       | n/a                                                                                                        | never                                        | never                                                  |
| Error reports                                          | an opaque user id, release, device model and OS, breadcrumbs, the error | Sentry (queued on the device while offline)                                            | in transit (TLS)                      | the Sentry project's retention                         | the user id is cleared                         | queued events: no                                                                                          | —                                            | —                                                      |
| Analytics events                                       | an opaque user id, event names, enums, route patterns                   | the provider (none ships: REQUIERE CONFIGURACIÓN)                                      | in transit                            | the provider's retention                               | the identity is reset                          | no                                                                                                         | —                                            | —                                                      |
| Logs                                                   | development only                                                        | the developer's terminal; in release builds only breadcrumbs                           | —                                     | —                                                      | —                                              | —                                                                                                          | —                                            | as breadcrumbs, redacted                               |

**No personal data in telemetry** (analytics, error reports, logs) unless a product requirement
justifies it, it is configured on purpose, declared in the store privacy forms and covered by the
privacy policy. Identifiers are opaque ids, never emails or names.

### Data the API keeps

What the app sends ends up here; the store privacy forms and the privacy policy cover it too. A
feature that adds data adds its row.

| Data                                          | Sensitivity                                                                           | Where                                                                                                                         | Protection at rest                                  | Kept until                                                                                 | On account deletion                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Account: email, name, role, password          | personal; the password secret                                                         | PostgreSQL `users`                                                                                                            | the password as an argon2id hash only               | deletion                                                                                   | deleted                                               |
| Sessions (refresh tokens)                     | secret                                                                                | PostgreSQL `sessions`                                                                                                         | SHA-256 of the token only                           | their expiry (swept), revoked ones too until then                                          | deleted (cascade)                                     |
| One-time links (password reset, email change) | secret                                                                                | PostgreSQL `account_tokens`, the address they concern                                                                         | SHA-256 of the token only                           | used or expired                                                                            | deleted (cascade)                                     |
| Pending sign-ups and invitations              | personal (email, name)                                                                | PostgreSQL `sign_ups`, `invitations`                                                                                          | link token hashed; the sign-up's password as a hash | confirmed, replaced, revoked or expired                                                    | not tied to an account                                |
| Items (the example resource)                  | depends on the product                                                                | PostgreSQL `items`, with the create's `Idempotency-Key` and a body hash                                                       | none beyond the database's                          | deletion                                                                                   | deleted (cascade)                                     |
| Email outbox                                  | personal (the address)                                                                | PostgreSQL `mail_messages`                                                                                                    | a keyed hash of the address for limits and lookups  | the address until the message is sent or dropped (a failed one's: 7 days); the row 30 days | queued messages deleted; the deletion notice is sent  |
| Devices (push notifications)                  | device identifier (the Expo push token), the account, platform, app version           | PostgreSQL `devices`                                                                                                          | none beyond the database's                          | sign-out; 30 days after the token died; 270 days unseen                                    | deleted (cascade)                                     |
| Push outbox                                   | ids only: the kind, the account, the device; the text has no personal data            | PostgreSQL `push_messages`; the text passes through Expo's push service, then Apple or Google                                 | none beyond the database's                          | the row 30 days after it finished                                                          | deleted (cascade)                                     |
| Rate-limit counters, cache, locks             | none (hashed keys)                                                                    | memory or Redis                                                                                                               | addresses and tokens hashed in keys                 | their window or TTL                                                                        | expire on their own                                   |
| Logs, traces, error reports                   | request ids, user ids, routes                                                         | the API's output, the OpenTelemetry backend, Sentry (all optional)                                                            | redacted: no tokens, passwords or bodies            | the platform's retention                                                                   | the user id remains in past entries                   |
| Web server access log (the web image)         | the client's address, the path without its query string, the user agent, a request id | the web server's output (stdout → the platform)                                                                               | none beyond the platform's                          | the platform's retention                                                                   | not tied to an account                                |
| Backups of the database (the project's)       | all of the above                                                                      | the backup storage (REQUIERE CONFIGURACIÓN); on the reference server, the volume `app_db_backups` and its copy off the server | the storage's; on the server, its disk              | their rotation (on the server, `BACKUP_KEEP_DAYS`: 7 days)                                 | kept until they rotate (say so in the privacy policy) |

## Network

- HTTPS only: `apps/mobile/src/config/env.schema.ts` rejects `http://` URLs except localhost and the
  Android emulator host, and requires HTTPS in production; Android release builds disallow cleartext
  (`usesCleartextTraffic` is only enabled for the `e2e` variant against the local mock API); iOS App
  Transport Security stays at its default.
- Every request has a timeout and a request id; tokens are sent only to the configured API.
- API responses are validated with Zod before use.

## Logging and reports

Nothing that identifies a user or grants access leaves the device in logs, breadcrumbs, error
reports, performance traces or analytics:

- `apps/mobile/src/lib/observability/redact.ts` replaces values under sensitive keys (`password`,
  `token`, `authorization`, `cookie`, `secret`, `apiKey`, …), masks emails and bearer tokens in
  text, and drops query strings from URLs; Sentry events and breadcrumbs pass through it
  (`scrubEvent`, `scrubBreadcrumb`), and so do transactions when tracing is on (`scrubTransaction`:
  the request spans' URLs lose the query strings, where a search carries what the user typed).
- Sentry: `sendDefaultPii` off, no screenshots or view hierarchies attached, failed HTTP requests
  not captured with bodies; users identified by opaque id only.
- Analytics: only after consent; events carry enums, counts and ids, never free text.
- `console.log` is not allowed in app code; `logger` prints in development only.

## Platform hardening

Configured in `apps/mobile/app.config.ts`:

- Android: `allowBackup` off (no adb or cloud backup of app data); only the permissions the app uses,
  and `blockedPermissions` for ones libraries add but the app does not need
  (`SYSTEM_ALERT_WINDOW`, external storage); R8 minification and resource shrinking in release
  builds; App Links verified (`autoVerify`) when a link domain is configured.
- iOS: universal links through associated domains (verified by Apple against the domain); the export
  compliance flag set for HTTPS-only encryption (review it if the app adds cryptography); no Face ID
  usage text, since nothing uses biometrics (`expo-secure-store` with `faceIDPermission: false`).
  The one other usage text, local network, comes from the development client and is never prompted
  in release builds ([docs/store-compliance.md](docs/store-compliance.md)).
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
a `faceIDPermission` text in `apps/mobile/app.config.ts`); screenshot blocking with
`expo-screen-capture` on the screens that need it. Each one is a native change: a new store build
([docs/releases.md](docs/releases.md#what-can-ship-as-an-ota-update)).

## Dependencies

- Installed with pnpm under supply-chain settings (`pnpm-workspace.yaml`): a release must be at
  least **seven days old** (`minimumReleaseAge`), a package whose provenance or trust level drops
  is refused (`trustPolicy: no-downgrade`), transitive dependencies from outside the registry are
  refused (`blockExoticSubdeps`), and **no install script runs** unless listed in `allowBuilds`
  (every entry is `false` except the API's reviewed native builds, argon2 and Prisma's engines,
  each with its reason in `scripts/dependency-policy.json`).
- For an urgent security fix younger than seven days, exempt that exact version
  (`minimumReleaseAgeExclude: [name@1.2.3]`, never a name or a pattern) and record it in
  `scripts/dependency-policy.json` with its reason and `expires`, the date the version is old
  enough. From that date `pnpm deps:check` fails until both entries are deleted.
- `pnpm audit --audit-level=high` in `pnpm security` and CI; Dependabot security updates.
- Expo SDK packages move together through SDK upgrades; Dependabot proposes their patches only.
- Every release carries a CycloneDX SBOM of the production dependencies (`pnpm sbom:generate`):
  the npm packages they resolve to in the lockfile, peer dependencies included (so some tools
  appear, Jest through a peer of `expo-router`). It does not list the native libraries Gradle and
  CocoaPods resolve during an EAS build (AndroidX, the native Sentry SDKs, the Hermes engine),
  and it describes the tag, not a build: EAS keeps the build itself.
- A new dependency is justified in its pull request: maintained, New Architecture compatible,
  license allowed, smallest reasonable footprint (bundle and binary).

## Known advisories

`pnpm audit --audit-level=high` runs in `pnpm security` and CI. When an advisory cannot be fixed
yet, it is handled in the open, in `pnpm-workspace.yaml`, never by lowering the audit level:

| Advisory                                                                                            | Package (path)                                                                        | Handling                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-pqg4-j6r4-53mv (critical)                                                                      | shell-quote (`react-devtools-core` in React Native)                                   | fixed: `overrides` forces 1.11.0 or later; remove the override once React Native's tree resolves it without                                                                                                                                                                       |
| GHSA-68fv-2mgg-jv7q (high)                                                                          | source-map-js (postcss in Expo's Metro config)                                        | fixed: `overrides` forces 1.2.2; remove the override once Expo's tree resolves it without                                                                                                                                                                                         |
| GHSA-ggr8-5vv4-36mx (high)                                                                          | deepmerge-ts (`@prisma/config`, the API)                                              | fixed: `overrides` forces 8.0.2 or later; remove the override once Prisma resolves it without                                                                                                                                                                                     |
| GHSA-3f6p-5ww8-9rcr (high), GHSA-rgwj-5xj2-c3m3 (moderate)                                          | mysql2 (the `prisma` CLI's MySQL support; the API uses PostgreSQL)                    | fixed: `overrides` forces 3.24.5 or later; remove the override once Prisma resolves it without                                                                                                                                                                                    |
| GHSA-27r3-jxmh-p828 (high)                                                                          | body-parser (express 5, the API: every JSON route)                                    | fixed: `overrides` forces 2.4.0 or later within express's range; remove the override once the lockfile resolves it without                                                                                                                                                        |
| GHSA-q7qp-rjg7-q26m (high)                                                                          | multer (`@nestjs/platform-express`, the API image; no route takes uploads)            | fixed: `overrides` forces 2.5.0; remove the override once `@nestjs/platform-express` requires it                                                                                                                                                                                  |
| GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h (moderate)                            | nodemailer (the API's mail transport)                                                 | fixed: the API requires 10.1.4                                                                                                                                                                                                                                                    |
| GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr (moderate), GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp (low) | fast-uri (`ajv` in commitlint, secretlint, the Nest CLI, the Prisma CLI, astro check) | fixed: `overrides` forces 3.1.9 or later within ajv's range; development tools only                                                                                                                                                                                               |
| GHSA-86w9-cpqp-85rv (high)                                                                          | node-forge (`@expo/cli` update code-signing helpers)                                  | `audit.ignore`: no fixed version exists; development tool, not in the app binary                                                                                                                                                                                                  |
| GHSA-vfj7-8cjw-p6xm (high)                                                                          | braces (Metro's file watcher)                                                         | `audit.ignore`: no fixed version exists; build tool fed by the project's own configuration                                                                                                                                                                                        |
| GHSA-mrhx-c7xc-m3w5 (high)                                                                          | zod 3 (`@expo/cli`; the app and the API use zod 4.6.7)                                | `audit.ignore`: no fixed 3.x exists, and every `@expo/cli` up to 58.1.15 requires `^3.25.76`; development tool validating its own configuration, not in the app binary                                                                                                            |
| GHSA-vcc3-ghjq-m6fr (moderate)                                                                      | decode-uri-component (`query-string` in Expo Router)                                  | in the app; the fix (0.5.0) is incompatible with the version range Expo Router requires. Mitigated: every incoming link passes the allowlist of `apps/mobile/src/lib/links.ts` (query strings dropped, path parameters restricted to `[A-Za-z0-9_-]`) before the router parses it |
| GHSA-w5hq-g745-h8pq, GHSA-hp3w-g68c-fv3c (moderate)                                                 | uuid (`xcode`, prebuild), sprintf-js (Jest coverage)                                  | build and test tools only                                                                                                                                                                                                                                                         |

`pnpm deps:check` prints the ignored advisories and the release-age exemptions on every run. Each
entry is removed as soon as a fix ships; the Expo SDK upgrades usually bring them. A release-age
exemption also fails the check from its expiry date on.

## Dependency policy

`scripts/check-dependencies.mjs` (`pnpm deps:check`, part of `pnpm security`) enforces
`scripts/dependency-policy.json`:

- every package comes from the npm registry, with an integrity hash in the lockfile (a direct
  dependency linked from a local directory fails too);
- licenses: an allowlist for everything, a wider one for development-only packages, and named
  exceptions with their reason (for example the Sentry CLI, a build-time tool under the Functional
  Source License). An SPDX expression passes when it can be met with allowed licenses alone, read
  as SPDX reads it (`(MIT OR Apache-2.0) AND GPL-3.0` needs GPL-3.0), each version on its own
  (`scripts/licenses.mjs`);
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

| Tool                      | Runs                                                    | Scope                                                                                                 |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TypeScript strict, ESLint | pre-commit (ESLint, staged files), pre-push (types), CI | type safety, architecture rules, React and hooks rules                                                |
| Semgrep (`pnpm sast`)     | CI, on demand (Docker)                                  | curated rulesets: OWASP Top 10, TypeScript, React, Node.js, Express, JWT, Dockerfiles, nginx, secrets |
| Trivy                     | CI (the Images job)                                     | the API's images: operating system packages and Node.js packages; fixable HIGH and CRITICAL fail      |
| CodeQL                    | CI, opt-in (`ENABLE_CODEQL`)                            | `security-extended` queries                                                                           |
| zizmor, actionlint        | CI, `pnpm lint:workflows` (Docker)                      | the workflows themselves                                                                              |
| secretlint, gitleaks      | pre-commit and CI; gitleaks on history                  | secrets                                                                                               |

Any finding fails. A false positive is suppressed where it occurs with the reason on the same line
(`// nosemgrep: <rule> -- why`), so review sees it.

## Release integrity

- Builds come only from commits on `main` that passed every gate, started by a person through a
  protected GitHub environment ([docs/ci-cd.md](docs/ci-cd.md#what-protects-production)).
- Signing keys never leave EAS; Google Play App Signing holds the Android app signing key.
- OTA updates reach only builds of the same native fingerprint; the production channel is protected.
  For end-to-end verification of updates, enable EAS Update code signing (`--private-key-path`, the
  certificate in `apps/mobile/app.config.ts` under `updates.codeSigningCertificate`) when the
  account plan allows it.
