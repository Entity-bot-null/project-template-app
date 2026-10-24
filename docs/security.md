# Security

The API's security design (`apps/api`): what it does, where, what it does not do, and what every
project still has to decide. The app's half (the device, secure storage, the network rules, OWASP
MASVS, the data inventory) and the security policy, reporting a vulnerability included, are in
[SECURITY.md](../SECURITY.md); so are the repository's dependency controls, which the API shares.

No configuration makes an application impenetrable. These controls close the common, well-known
attacks by default and make the rest visible: [Known limits](#known-limits) lists what stays open
on purpose, and [Per project](#per-project-requiere-configuración) what each project must decide.

Paths are relative to `apps/api/src` unless they start at the repository root (`apps/`, `scripts/`,
`.github/`, `docs/`).

## Controls by OWASP Top 10 (2021) category

| Risk                                  | Control in the template                                                                                                                                                                                                                                                                                                                           | Where                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken access control             | `@Auth(...roles)` on every non-public route; ownership checks in the services' queries (404 for others' records); Fetch Metadata guard on every route                                                                                                                                                                                             | `auth/auth.decorator.ts`, `users/users.service.ts`, `items/items.service.ts`, `common/guards`                                |
| A02 Cryptographic failures            | argon2id (OWASP parameters); refresh tokens and one-time tokens stored as SHA-256; HS256 pinned on signer and verifier, 64+ character secret; no cookies; `Cache-Control: no-store` on every response; HTTPS at the edge; the refresh token in the device's Keychain/Keystore ([SECURITY.md](../SECURITY.md#storage))                             | `auth/password.ts`, `auth/sessions.service.ts`, `auth/account-tokens.ts`, `auth/auth.module.ts`, `env/`                      |
| A03 Injection                         | Zod validation of every body and query; Prisma parameterized queries (ESLint forbids the `*Unsafe` raw variants); every value in an email template HTML-escaped, no line break in a subject; SAST (Semgrep) on every pull request; ZAP API scan (DAST) weekly                                                                                     | `common/pipes`, `common/openapi`, `infrastructure/mail/templates`, `eslint.config.mjs`, `scripts/sast.mjs`, `.zap/rules.tsv` |
| A04 Insecure design                   | Contract review before implementation (the API generates `openapi/openapi.json`, reviewed like code); the threat model of a mobile client; Definition of Done security item                                                                                                                                                                       | `openapi/README.md`, `SECURITY.md`, `DEFINITION_OF_DONE.md`                                                                  |
| A05 Security misconfiguration         | Validated env (boot fails on bad config; `NODE_ENV` has no default; `TRUST_PROXY` required in production); helmet headers; no Swagger UI in production; API on loopback outside production; non-root containers without Node.js package managers                                                                                                  | `env/`, `app.setup.ts`, `server.ts`, `apps/api/Dockerfile`                                                                   |
| A06 Vulnerable components             | `pnpm audit` (high+ fails) locally and in CI; image scanning (Trivy) in CI; Dependabot; seven-day release delay, trust-downgrade refusal, install-script allowlist, registry-only sources and a license policy; GitHub Actions pinned by SHA and tool and base images by digest                                                                   | `pnpm-workspace.yaml`, `scripts/dependency-policy.json`, `.github/`                                                          |
| A07 Identification and authentication | Short access tokens, kept in memory by the app; rotating refresh tokens in families with reuse detection and a 90-day absolute lifetime; timing-safe sign-in; sign-in attempts limited per address tried, with a per-IP ceiling that a forged `X-Forwarded-For` cannot escape                                                                     | `auth/`                                                                                                                      |
| A08 Software and data integrity       | Frozen lockfile installs with sha512 integrity, lockfile diffs visible in review; committed migrations only; CI gates before merge; workflows audited (zizmor) with least-privilege tokens; immutable release tags; SBOM per release; provenance and SBOM attestations on images once they are pushed                                             | `.github/workflows/`, `.github/rulesets/`, `scripts/check-dependencies.mjs`                                                  |
| A09 Logging and monitoring failures   | Structured logs with request ids, automatic redaction of credentials in every log line, error report and span; 5xx logged with stack and origin; access logs without query strings or bodies; theft of a refresh token logged as a warning; optional error tracking and tracing with the same redaction                                           | `common/logging/`, `observability/`, [observability.md](observability.md)                                                    |
| A10 Server-side request forgery       | The API makes no outbound requests of its own beyond the services it is configured for (SMTP, Sentry, an OTLP endpoint); integrations use `createExternalHttpClient`, which keeps every path under the configured base URL (values encoded as segments). Any feature that fetches a user-supplied URL needs an allowlist (REQUIERE CONFIGURACIÓN) | `common/http/external-http.ts`                                                                                               |

## Authentication and tokens

The API's own accounts: an email and a password, a short access token and a rotating refresh
token, both in response bodies, never in cookies
([ADR 0007](adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md)). The app's half of the
session (memory, secure storage, renewal, sign-out) is in
[mobile-architecture.md](mobile-architecture.md#authentication).

- **Access token:** JWT, HS256, 15 minutes (the session's `expiresIn` says so), claims
  `{ sub, role, sv }` only. The app keeps it in memory and sends it as `Authorization: Bearer`
  (the scheme in any letter case). Verified offline (signature, expiry, claims shape), with the
  algorithm pinned, then `sv` against the account's `security_version` (one primary-key lookup per
  request): a password change or reset, a change of email or its undo increments it, so every
  access token issued before is refused at once, not when it expires; a deleted account has no
  row, so its tokens are refused too
  ([ADR 0006](adr/0006-security-version-in-access-tokens.md)).
- **Refresh token:** 32 random bytes in base64url (43 characters), returned in the body of every
  session response and sent back in the body of `POST /api/auth/refresh` and
  `POST /api/auth/logout` (`{ refreshToken }`); anything but 43 base64url characters is refused
  (400) before any lookup. The database keeps only its SHA-256: a leaked table cannot be replayed,
  and since the token has full entropy a plain hash is enough (no secret, an exact lookup). The API
  sets and reads no cookie at all.
- **Session responses:** `POST /api/auth/sign-in`, `POST /api/auth/refresh`,
  `POST /api/auth/sign-ups/confirm`, `POST /api/auth/invitations/accept` and
  `POST /api/account/password` answer `{ accessToken, refreshToken, expiresIn, user }` (the
  contract's `Session`; `user` is a `SessionUser`: id, email, name, role).
- **Sign-in** answers one message for an unknown email and a wrong password, with equal timing (a
  dummy hash, built at boot, so the first unknown email after a start pays no extra hash). No
  password policy applies at sign-in: what was accepted when it was set keeps working. Every
  sign-in starts a family of its own: each device has its own session, and signing in on one ends
  none of the others. Attempts are limited per address tried ([Rate limiting](#rate-limiting)).
- **Logout** (`POST /api/auth/logout`, 204) ends the family of the presented token, whatever its
  state: a token already rotated (a sign-out that raced a renewal sends the previous one) still
  ends the session it belongs to. Idempotent: a token already ended, expired or unknown answers
  204 too. When the database cannot be reached it answers 500 and nothing changes; a retry ends the
  session.
- **Lifetimes:** each rotation slides the session to 30 days of inactivity; a family ends 90 days
  after its sign-in whatever the activity (`REFRESH_FAMILY_MAX_AGE_SEC`). Expired rows are swept at
  boot and hourly; revoked ones stay until their own expiry, so a replay is recognized at any point
  of a token's life.
- **Not included (REQUIERE CONFIGURACIÓN per product):** MFA, SSO, account lockout per user, a list
  of the account's sessions (devices), changing a user's role through the API (an operator's job).

### Sessions

Refresh token rotation with family revocation, the pattern of RFC 9700, adapted to phones, whose
renewals lose their answers to dropped connections (`auth/sessions.service.ts`):

- **Rotation and families:** every refresh token works once. A renewal revokes it as rotated,
  creates its successor in the same family (one family per sign-in) and returns the new pair, with
  the user and the role read fresh from the database: a role change applies at the next renewal.
- **Reuse detection:** a token presented again after its rotation means someone else holds a copy:
  its whole family ends (the thief's copy and the user's current token), the incident is logged as
  a warning (`Refresh token reuse for user <id> (at refresh)`, or `(at logout)` when the token
  comes to a logout), and the user's other families (other devices) are untouched. The renewal
  answers 401.
- **The reuse window, for lost answers:** the server rotated the token, the connection dropped
  before the answer arrived, and the phone, which still holds the old token, sends it again. A
  token presented again within 30 seconds of its rotation (`REFRESH_REUSE_LEEWAY_SEC`), while the
  successor that rotation created was never used, is that renewal retried: it gets a new pair. The
  unused successor is revoked and marked `superseded`, and the retried token's `replaced_by_id`
  points at the new one. A retry keeps the time of the first rotation, so retries never stretch the
  window. Past the window, or within it with the successor already used (another client renewed
  with it), the token is reused: the family ends.
- **A superseded token presented later** (the lost answer reached someone after all) means two
  clients hold the family: it ends, logged as reuse.
- **Concurrent renewals of one token** (a retry sent while the first is still running) are
  serialized by the user's row lock (`SELECT ... FOR UPDATE` on `users`): the second finds the
  token just rotated and its successor unused, a retry within the window. Both answer 200, and the
  **last** pair is the live one, the first superseded: that is the answer the phone waits for,
  since it dropped the first request when it retried. The family is never left without a live
  session and never has two. A logout that races a renewal of the same token leaves no live
  session.
- **One change at a time:** every change to a user's sessions (sign-ins, rotations, logouts,
  revocations) and every account change (a new password, a reset, a change of email, a deletion)
  takes that user's row lock first, so they never interleave. Those transactions run in READ
  COMMITTED whatever the database's default, so what they read after the lock is what the one they
  waited for committed (under a stricter default, a renewal that waited for another would fail with
  a serialization error; a spec runs them against SERIALIZABLE). A sign-in whose password hash
  changed between the check and the session (a password change in between) is refused, so it
  cannot outlive the revocation. Revoking sessions by hand takes the same lock
  (`SessionsService.revokeAll`, or `lockUser` inside a transaction): a plain `UPDATE` misses the
  token a renewal in flight commits after it.
- **Failures:** only a 401 means the session ended. A renewal that fails on the server (a database
  failover: a 5xx) rolls back and changes nothing, so the token still works when retried and an
  outage signs nobody out; the app keeps its tokens on anything but a 401.
- **On the device:** the app keeps the refresh token in SecureStore (the Keychain / the Android
  Keystore, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: never in a backup or on another device) and the
  access token in memory only ([SECURITY.md](../SECURITY.md#storage)).
- **Accepted trade-off:** a copy of a token replayed within 30 seconds of its rotation, before the
  legitimate client used the successor, gets a pair. The theft is detected at the legitimate
  client's next renewal (its token is superseded by then) and the family ends there.

### Passwords

The policy of every password a person sets (`auth/password-policy.ts`; `user:create`, sign-up,
invitation acceptance, password reset and change, the undo of a change of email), following NIST SP
800-63B-4 and the password requirements of OWASP ASVS 5.0 (chapter V6). The template is designed
against them; it is not certified, and a project that needs a compliance claim verifies it itself.

- **Length:** 15 to 200 characters, counted as code points (an emoji is one), never truncated. A
  request carries at most 400 UTF-16 units of password (200 characters outside the basic plane): a
  longer field is refused before any hashing. No composition rules (no "one digit, one symbol"), no
  periodic expiry; spaces and any Unicode are allowed.
- **Normalized** to NFKC before hashing and comparing, so the same passphrase typed on another
  keyboard or device matches. Hashes made before normalization still verify (the raw form is tried
  when it differs), so no existing password stops working.
- **Refused:** the 16,050 passwords of 15 characters or more that are most used (SecLists, checked
  locally: a password never leaves the API, `scripts/build-common-passwords.mjs` pins the source by
  commit and SHA-256); repeated characters, sequences (`abcdef...`) and repeated blocks; the
  account's email address, its local part or a word of the name (4 characters or more). A refused
  password answers 400 with the reason, its field named in `errors` (`password`, or `newPassword`
  for a change: [error-handling.md](error-handling.md)).
- **Argon2id** (19 MiB, 2 passes, parallelism 1: OWASP's minimum configuration). Sign-in hashes
  once whether the account exists or not (a dummy hash), so timing does not reveal accounts.

### One-time tokens

The links the API emails (password reset, sign-up confirmation, invitation, change of email and its
undo) carry one-time tokens. An account's own links live in `account_tokens`
(`auth/account-tokens.ts`); a sign-up's and an invitation's token lives on its row:

- **256 random bits** (32 bytes, base64url: 43 characters), minted when the message is sent (the
  outbox renders it then), so a message that is never sent leaves no working token behind. The
  database keeps only its SHA-256: the token exists in the message on its way and in the link its
  owner opens, never in the database or the outbox.
- **Bound to the account:** an account token records its purpose, the account, the address it was
  sent to and the account's `security_version`. It works once, until it expires, and only while the
  account is as it was when it was minted (the same `security_version` and address), except the
  undo link of a change of email ([Change of email](#change-of-email)). A new link of a kind
  replaces the earlier unused ones, so at most one works; a credential change ends every
  outstanding one.
- **Spent once:** using an account token locks the account's row, then the token's
  (`FOR UPDATE`), checks it and marks it used, in the transaction that makes the change; a
  sign-up's or an invitation's row is locked and deleted in the transaction that creates the
  account. Two requests with one token: one succeeds, the other finds it used or gone. Every
  token that does not work answers one 404 ("invalid or expired"), whatever the reason. A token
  that is not 43 base64url characters is refused (400) before any lookup.
- **Swept:** used and expired tokens a day later (the hash is worthless by then; the day leaves a
  trace for an investigation of the moments around it), with the sign-ups and invitations nobody
  can finish any more.
- **The link** is `APP_ORIGIN` + `APP_BASE_PATH` + the screen + `#token=...`
  (`https://app.example.com/app/reset-password#token=...`), never built from a request's `Host`.
  The token travels after `#`, which no browser sends to a server or in a `Referer`. Opening a
  link changes nothing: only the request that sends the token, from the screen where the person
  submits it, spends it, so a mail scanner or a preview that fetches the link does no harm.
  `APP_ORIGIN` is the https domain the app claims for universal links and App Links
  ([mobile-architecture.md](mobile-architecture.md#deep-links)); the app opens a link only through
  the allowlist of `apps/mobile/src/lib/links.ts`, and the screens for these links (which keep the
  token in memory only, never in storage, logs or reports) are the app's to add.

### Password recovery

- **Asking for a link** (`POST /api/auth/password-resets`, `auth/password-reset.service.ts`):
  answers 204 at once, the same for any address, before looking it up; the lookup and the queueing
  run after the answer, so neither the body, the status nor the timing tells whether an account
  exists. Limits: 5 requests per 15 minutes per address tried, at most 50 per 15 minutes from one
  IP, and per address one message a minute and `MAIL_DAILY_LIMIT_PER_ADDRESS` a day (shared by
  every instance, [Email](#email)); an address differing only in letter case or spaces is the same
  address. 503 when email is off, and `GET /api/auth/capabilities` tells the app not to offer it.
- **The token** ([One-time tokens](#one-time-tokens)): valid for 30 minutes, at the screen
  `reset-password`.
- **Using it** (`POST /api/auth/password-resets/confirm`): the new password is checked first (a
  refused one keeps the link working); then one transaction, under the account's row lock, locks
  the token row, requires it unused, unexpired, for the same account, address and
  `security_version`, marks it used, replaces the hash, increments `security_version`, ends every
  refresh session and other reset link, and queues a notice to the owner. Two simultaneous uses:
  one 204, the other 404. Any failure rolls all of it back. Nobody is signed in: the person signs in
  with the new password on each device.
- **The notice** ("your password was changed", never held back by the per-address limits) says
  when and how, and links to password recovery in case it was not the owner. It carries no token.
- **Logs** name the account by id, never its address; tokens, passwords and links are never logged
  (the logger also redacts credential shapes).

### Password change

`POST /api/account/password`, signed in (`account/account.service.ts`):

- **The current password again:** a session alone is not enough (it may be in someone else's
  hands). A wrong one answers 403, not 401: the session is fine, the confirmation is not, and a 401
  would make the app renew its session and send the request again. 5 attempts per 15 minutes per
  user.
- **The same policy** for the new one ([Passwords](#passwords)).
- **One transaction** under the account's row lock: a change is refused if the password changed
  meanwhile (409); otherwise the hash is replaced, `security_version` increments (every access
  token ends at once), every session and reset link ends, and the notice is queued.
- **This device carries on** in a new session the answer brings (a `Session` body, which the app
  adopts); every other device is signed out at once.

### Sign-up

Public sign-up is OPTIONAL: off unless `SIGN_UP_ENABLED=true`, which requires email (the boot
fails otherwise); off, accounts are created by an operator (`user:create`) or invited
([Invitations](#invitations)), and `GET /api/auth/capabilities` tells the app not to offer it (403
on both routes). When it is on:

- **No account until the address is confirmed.** `POST /api/auth/sign-ups` records a pending
  sign-up (`sign_ups`: address, name, the password's Argon2id hash) and emails a link; the account
  is created only when the link is confirmed. Sign-in, password recovery and the user list never
  see an unconfirmed sign-up, and an unconfirmed one cannot sign in. One pending sign-up per
  address: a newer one replaces it and its link, unless its own message is held back by the
  per-address limits (then the earlier one stays as it was).
- **No account enumeration.** The answer (202) is the same, byte for byte and at once, for every
  well-formed request whose password follows the policy (400 otherwise, which says nothing about
  the address); the lookup, the hashing and the queueing run after it. An address that already has
  an account gets a notice to its owner ("someone tried to create an account with this address"),
  never a link; the person signing up cannot tell the difference.
- **The confirmation needs the link AND the password chosen at sign-up**
  (`POST /api/auth/sign-ups/confirm`). Someone who signs up with another person's address (to
  pre-claim it) cannot use the account without that person's mailbox; and the person who receives
  a link they did not ask for cannot finish the stranger's sign-up by opening it, because they do
  not know its password (401). Every attempt is counted before its password is checked, in one
  atomic statement, so requests sent in parallel cannot check more than five; a wrong fifth drops
  the sign-up and its link. The confirmation creates the account (role `member`) and signs it in:
  a session of its own, like a sign-in.
- **The token:** 256 random bits, minted when the message is sent, only its SHA-256 stored on the
  sign-up; 24 hours, once (the sign-up row is deleted in the transaction that creates the account,
  under its row lock: two confirmations, one account). The link opens the screen `confirm-sign-up`,
  handled like every emailed link ([One-time tokens](#one-time-tokens)).
- **Limits:** 5 sign-ups per 15 minutes per address, at most 50 per 15 minutes from one IP; 10
  confirmations per 15 minutes per link, at most 100 per 15 minutes from one IP; per address, one
  message a minute and `MAIL_DAILY_LIMIT_PER_ADDRESS` a day, shared with password recovery. An
  address that gets an account by other means after the link was sent answers 409.
- **Cleanup:** sign-ups whose link expired a day ago, or whose message never went out, are deleted
  by the hourly sweep.

### Invitations

Administrators invite people through `/api/admin/invitations` (`@Auth('admin')`: the role is checked
by the API on every route, whatever a client shows):

- **No account until it is accepted.** An invitation lives in `invitations` (address, role, who
  invited) until its link is accepted; sign-in, recovery and the user list never see it. Inviting an
  address that has an account answers 409 (administrators see every account anyway); inviting one
  again replaces its invitation and link; revoking deletes it and its link at once. 503 when email
  is off.
- **The person chooses their own name and password** (`POST /api/auth/invitations/accept`, the
  password policy applies, a refused one keeps the link): the administrator never knows it. The
  **role is fixed by the administrator** and read from the invitation under its row lock when the
  account is created: nothing in the request can change it. An invitation works only while
  **whoever sent it is still an administrator**: a demotion or a deletion voids the invitations
  they sent, with the role they grant. Accepting takes the address's lock, as inviting does, so a
  new invitation cannot be created alongside an acceptance. The acceptance signs the new account
  in: a session of its own, like a sign-in.
- **The token:** 256 bits minted when the message is sent, only its SHA-256 stored on the
  invitation, 7 days, once (the invitation row is deleted in the transaction that creates the
  account: two acceptances, one account; an address that got an account meanwhile answers 409).
  The link opens the screen `accept-invitation`, handled like every emailed link.
- **Limits:** 30 invitations per 15 minutes per administrator; per address, one message a minute
  and `MAIL_DAILY_LIMIT_PER_ADDRESS` a day (an administrator who resends too soon gets 429, and the
  earlier invitation stands); 10 acceptances per 15 minutes per link, at most 100 per 15 minutes
  from one IP. Expired invitations are swept.
- **Logs** name invitations and accounts by id (who invited, who revoked, which account was created
  with which role), never the address.

### Change of email

The account's address changes in three steps, built so that a session (and even the password) in
someone else's hands cannot take the account for good (`account/email-change.service.ts`):

- **Asking** (`POST /api/account/email`, signed in): requires the current password (403 otherwise,
  for the reason a password change gives; 5 attempts per 15 minutes per user). The current address
  answers 400 (`errors` names `newEmail`); 503 when email is off. A link valid for 24 hours goes to
  the **new** address; nothing changes until it is opened. If the new address already has an
  account, its owner gets a notice instead and the person asking is answered the same (202, the
  lookup after the answer): no enumeration. Limited per address like every link.
- **Confirming** (`POST /api/auth/email-changes/confirm`, from the new mailbox, signed in or not):
  the token works once and only while the account is as it was when it was sent (same address and
  `security_version`: a password change in between voids it). In one transaction under the
  account's row lock: the address changes, `security_version` increases (every access token ends at
  once), every session ends (sign in again with the new address), the other reset and change links
  of the account are dropped, and the **previous** address gets a notice with a link to undo the
  change. An address taken meanwhile answers 409.
- **Undoing** (`POST /api/auth/email-changes/revert`, from the previous mailbox, within **7
  days**): the previous address comes back **with a new password chosen there** (whoever changed
  the address knew the old one), `security_version` increases and every session ends. Every other
  link of the account is dropped **except the undo links minted before this one**: they undo
  earlier changes, so the earliest owner wins. Whoever took the account and undoes their own later
  change cannot void the owner's link; the owner's link voids theirs (both orders are tested). The
  undo link is **not bound to the account's later state** and is never replaced by a newer one:
  changing the address again or the password does not void it either. A refused password keeps the
  link usable; an address taken meanwhile answers 409.
- **Links and tokens** as for every emailed link ([One-time tokens](#one-time-tokens)), at the
  screens `confirm-email-change` and `revert-email-change`, with the target address stored next to
  the hash; 10 uses per 15 minutes per link, at most 100 per 15 minutes from one IP. The notice to
  the previous address shows the new one masked (`a•••@example.com`).

### Account deletion

`POST /api/account/deletion` with `{ password }`, signed in: 204 (`account/account.service.ts`,
[ADR 0012](adr/0012-account-deletion.md)). The stores require that an account created in an app can
be deleted from it ([store-compliance.md](store-compliance.md)).

- **The password again:** a session alone is not enough. A wrong password answers 403, not 401: the
  session is fine, the confirmation is not, and a 401 would make the app renew its session and send
  the request again. 5 attempts per 15 minutes per user.
- **For good, at once:** a hard delete, not an anonymization. One transaction, under the account's
  row lock, reads the account again and deletes its row; the database's cascades take everything
  it owns: its items, its sessions, its one-time links (`account_tokens`) and its messages in the
  outbox. Invitations it sent as an administrator lose their inviter (`invited_by_id` set to
  null), which voids them ([Invitations](#invitations)). Every access token stops at once (the guard
  finds no account), and every refresh token too (its session row is gone): the device that asked
  and every other one are signed out at their next request.
- **Refused:** the only administrator (409, "The only administrator cannot delete their account":
  nobody could invite or manage anyone). Administrators' deletions run one at a time, on every
  instance (a transaction-scoped advisory lock), so the last two cannot both pass the count. A
  password changed between the check and the deletion answers 409; an account deleted meanwhile
  from another device, 404.
- **The notice:** an `account_deleted` message to the account's address, queued in the same
  transaction on a message that belongs to no account (no `user_id`: the user is gone). The address
  stays on the outbox row until the message is sent, then is cleared like any other. It carries no
  link and no secret, says when, and tells a person who did not ask that someone knew the password.
  Never held back by the per-address limits.
- **Records:** the log names the account by id (`Account <id> deleted by its owner`); the metric
  `app.account.deletions` counts deletions, with no attributes.
- **What stays:** database backups taken before the deletion hold the account until they rotate
  out, so their retention is how long a deleted account survives (say so in the privacy policy);
  logs and error reports keep the opaque user id of past requests for their own retention. What the
  API keeps, and what a deletion takes: [SECURITY.md](../SECURITY.md#data-the-api-keeps).
- **Not included:** the web page where people can ask for a deletion without the app, which Google
  Play asks for ([store-compliance.md](store-compliance.md)). The app's screen that calls this
  route, and signs out locally after it, is the app's to add.

## Secret rotation

`JWT_ACCESS_SECRET` signs access tokens only; refresh sessions do not depend on it, so rotating it
never signs anyone out: a refused access token is renewed by the next refresh. It is also the key
material of the outbox's address hashes (HKDF): after a rotation, hashes made before no longer
match, so the per-address email limits start over and older outbox rows are found by id instead of
by address.

- **Leaked secret:** deploy a new `JWT_ACCESS_SECRET` (`openssl rand -hex 32`) without
  `JWT_ACCESS_SECRET_PREVIOUS`. Every token signed with the old one, forged or not, is refused at
  once.
- **Planned rotation, one instance:** deploy `JWT_ACCESS_SECRET=<new>` and
  `JWT_ACCESS_SECRET_PREVIOUS=<old>`; after 15 minutes (`ACCESS_TOKEN_TTL_SEC`) remove the previous
  value and deploy again.
- **Planned rotation, several instances:** during a rolling deployment old and new instances run
  together, so first deploy `JWT_ACCESS_SECRET_PREVIOUS=<new>` (every instance accepts the new
  secret, none signs with it yet), then swap the two values, then remove the previous one after 15
  minutes.

Other secrets (`DATABASE_URL` credentials, `MAIL_SMTP_URL`, `REDIS_URL`, registry tokens) rotate the
same way as anywhere: create the new value, deploy, verify, then revoke the old one.

## Authorization

Two layers, both required:

1. **Role (RBAC):** `@Auth('admin')` on the controller, or `@RequireRoles('admin')` on one handler
   of an `@Auth()` controller. Roles live in `common/types/request-user.ts` and the Prisma `Role`
   enum (a spec keeps them equal).
2. **Ownership (BOLA/IDOR):** the service decides whether this caller may touch this record, in the
   query itself (`UsersService.findVisible`, the items' `owner_id`). Records the caller may not see
   answer **404**, exactly like missing ones, so ids cannot be probed. The rules (writes, lists,
   nested and shared records, admin access) and the access-matrix test every such route gets:
   [authorization.md](authorization.md).

Role changes apply at the next refresh. `SessionsService.revokeAll(userId)` ends every refresh
session at once; an access token already issued stays valid until it expires (at most 15 minutes)
unless the account's `security_version` changes: a password change or reset, a change of email or
its undo increments it, and `JwtAuthGuard` then refuses every older access token at once. Increment
it in the same transaction for any other change that must end access at once (a role removed, an
account disabled). A deleted account's tokens stop at once without it: the guard finds no account.

What a client shows is not what is allowed: the app's route guards decide what to **show**, the API
decides what is **allowed**. Never rely on a hidden button or a client check alone.

## CSRF, CORS, XSS

- **No ambient credentials:** the API sets no cookies and reads none. A request is authenticated by
  a bearer token its sender put in the `Authorization` header, or by a refresh token its sender put
  in a JSON body; a browser attaches neither on its own, so a page on another site has no
  credential to ride (classic CSRF).
- **Fetch Metadata, still:** `FetchMetadataGuard` runs first on **every** route (a global guard,
  before the rate limiter). It stops other sites from making a visitor's browser call the API's
  public routes in the visitor's name (sign-ups, password reset requests, links) and from using up
  limits counted per client IP. A request whose `Sec-Fetch-Site` says another origin made the
  browser send it (`cross-site`, and `same-site`: a sibling subdomain) is refused with 403 unless
  its `Origin` is in `CORS_ORIGINS`. Browsers that send no Fetch Metadata (Safari before 16.4, and
  any browser on a page served over plain HTTP from a non-local address) still send `Origin` on
  cross-origin requests and on same-origin POSTs: without `Sec-Fetch-Site`, an `Origin` must be
  `APP_ORIGIN`, the scheme and host the request was sent to, or one of `CORS_ORIGINS`, and
  `Origin: null` is refused. Requests with neither header pass: the app (native code, not a
  browser, sends neither), CLIs, servers and probes. In production the API warns at boot without
  `APP_ORIGIN`: behind a proxy, nothing else tells it its public origin.
- **JSON bodies only** (`common/http/json-only.middleware.ts`, 415 otherwise): HTML forms
  (urlencoded, multipart, `text/plain`), the one kind of body another site can make a browser send
  without a CORS preflight, never reach a handler, even with an empty body.
- **CORS:** off by default (`CORS_ORIGINS` empty: no CORS headers at all). The app is not a
  browser: CORS does not apply to it. `CORS_ORIGINS` is for a browser client you build on another
  origin, and it allows no credentials mode (there are no cookies to send: such a page sets the
  bearer header itself). A browser client would also have to keep the refresh token where its own
  scripts can read it: design its session, and its CSP, before adding one.
- **XSS:** the API serves JSON only (its interactive docs, outside production only). Values in
  emails are HTML-escaped ([Email](#email)). The app has no WebView
  ([SECURITY.md](../SECURITY.md#owasp-masvs)).

## Security headers and caching

helmet's defaults on every response (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, CORP/COOP, no `X-Powered-By`) and `Cache-Control: no-store` (responses carry
tokens and personal data: neither a device nor a shared cache may store them), set in `app.setup.ts`
before any route. Every response also echoes its request id (`X-Request-Id`).

The web image (`apps/landing/nginx/security-headers.conf`) sets its own on every page and file it
serves: a CSP that allows this origin only and **no script at all** (`script-src 'none'`: the
landing ships HTML and CSS, its 0 kB JavaScript budget keeps it so), `frame-ancestors 'none'`,
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a
`Permissions-Policy` without camera, microphone or location, and COOP. Pages are revalidated
(`no-cache`), hashed assets cached for a year, the app's link files for 5 minutes. The open-in-app
page that answers `/app/*` also carries `X-Robots-Tag: noindex`, and is served at the link's own
address, never through a redirect: an emailed link's token rides in the fragment, which no request
carries, and the web server's access log drops query strings besides.

## HTTPS

TLS terminates at the edge (load balancer, ingress, the platform's router); REQUIERE CONFIGURACIÓN
per provider. Set HSTS there (`max-age` ≥ 1 year once HTTPS is permanent) and redirect HTTP to
HTTPS. The app refuses an `http://` API outside local development
([SECURITY.md](../SECURITY.md#network)).

**Client IP behind proxies.** Rate limits and logs need the real client address, which proxies pass
in `X-Forwarded-For`, a header any client can also send. The API believes it only across the hops
`TRUST_PROXY` names (Express's `trust proxy`), and production refuses to boot without the setting:

- A number is how many proxies stand in front of the API: the client address is read that many
  entries from the right of `X-Forwarded-For`, where the trusted proxies appended theirs, so
  whatever a client wrote further left is ignored. Addresses or subnets (`loopback`,
  `10.0.0.0/8`) trust those proxies instead. Count the real hops: one more than there are lets a
  client choose its own address and escape every per-IP limit.
- Outside production the default is `loopback`. The `stack` profile of `docker-compose.yml` puts
  the web image in front of the API, one proxy hop (`TRUST_PROXY=1`): it replaces whatever a client
  wrote in `X-Forwarded-For` with the address that connected to it.
- The API must be reachable only through those proxies (a private network). A client that reaches
  it directly can choose its own `X-Forwarded-For`.

**Host header.** Nothing builds a link or a redirect from the request's `Host` or forwarded
headers: the links in emails come from `APP_ORIGIN` and `APP_BASE_PATH`, required with email and
https in production ([Email](#email)), so a forged `Host` cannot poison a password-reset link. A
feature that needs the public URL reads it from configuration, never from the request.

Outside production the API listens on 127.0.0.1 only (`HOST`), so a development server with public
seed accounts never reaches the network; in production it listens on every interface, IPv4 and
IPv6.

## Rate limiting

`@nestjs/throttler`, by three throttlers that each count every request they apply to
(`common/guards/rate-limit.guard.ts`, values in `auth/auth.constants.ts`):

- **`default`**, on every route: `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_SEC` (100 per 60 seconds),
  per signed-in user (a valid access token, verified offline once per request), otherwise per
  client IP and the account the route names, otherwise per client IP.
- **`route`**, on the routes that declare a tighter limit of their own with `@RouteRateLimit`, on
  top of the global one: whichever runs out first blocks. `per: 'user'` counts the signed-in user;
  `per: 'email' | 'refreshToken' | 'token'` counts the client IP and the SHA-256 of that body field
  (an address normalized first), whoever is signed in: a sign-in or a link is about the account it
  names. Counter keys never hold an address or a token.
- **`route-ip`**, the per-IP ceiling (`ipCeiling`) of the routes that count per account: every
  account tried from one address together, at a looser limit.

**Why not per IP.** Phones share public addresses behind carrier NAT (CGNAT): thousands of people
can reach the API from one IP. Counting per IP alone would let one person's mistakes, or one
attacker, lock everyone behind that address out. So no route counts per client IP alone: a
signed-in person is counted as themselves, an attempt as the account it names, and the per-IP
ceilings, sized for many people, still bound what one address can do.

| Route                                                                                       | Limit                                                     | Per                                          | Ceiling per IP     |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- | ------------------ |
| Sign-in                                                                                     | 10 per 60 seconds                                         | address tried                                | 300 per 60 seconds |
| Refresh                                                                                     | 10 per 60 seconds                                         | refresh token                                | 600 per 60 seconds |
| Password reset request                                                                      | 5 per 15 minutes                                          | address                                      | 50 per 15 minutes  |
| Sign-up                                                                                     | 5 per 15 minutes                                          | address                                      | 50 per 15 minutes  |
| Password reset confirm, sign-up confirm, email change confirm and revert, invitation accept | 10 per 15 minutes                                         | link token                                   | 100 per 15 minutes |
| Password change, email change, account deletion                                             | 5 per 15 minutes                                          | signed-in user                               | none               |
| Invitations (administrators)                                                                | 30 per 15 minutes                                         | signed-in user                               | none               |
| Every route (global)                                                                        | `RATE_LIMIT_MAX` (100) per `RATE_LIMIT_WINDOW_SEC` (60 s) | signed-in user, else IP and account, else IP | none               |

Health probes are exempt; a `429` carries `Retry-After` whichever throttler blocked; requests from
an app version below the minimum are answered 426 before the limiter and never counted
([Minimum app version](#minimum-app-version)). Never set a route's limit with
`@Throttle({ default: ... })`: that replaces the global limit for the route instead of adding to
it.

**Sizing `RATE_LIMIT_MAX`.** A route that names no account, called without a valid access token
(`GET /api/auth/capabilities`, `POST /api/auth/logout`), counts per client IP at `RATE_LIMIT_MAX`.
Behind a large carrier NAT, many people share that allowance: raise `RATE_LIMIT_MAX` when the 429s
of those routes say so. Signed-in traffic counts per person and is not affected.

The counters live in a **store** chosen by `RATE_LIMIT_STORE`
(`infrastructure/rate-limit/rate-limit.store.ts`); the guard, the limits and the routes are the same
with either:

| Store              | When                                                                          | Behavior                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory` (default) | one instance                                                                  | the throttler's in-memory store                                                                                                             |
| `redis`            | several instances (needs `REDIS_URL`; the `stack` profile of Compose uses it) | shared counters: a client cannot multiply its allowance by the number of instances; same algorithm, atomically in a Lua script, server time |

While Redis is unreachable the Redis store does **not fail open**: each instance falls back to its
own in-memory counters (limits become per instance), logs the switch once, counts it
(`app.degraded.operations`) and goes back to Redis as soon as it answers.

## Minimum app version

Requests from an app version below `MOBILE_MIN_VERSION_IOS` / `MOBILE_MIN_VERSION_ANDROID` (unset:
any version) answer 426 before any other check (`common/http/app-version.middleware.ts`,
[ADR 0010](adr/0010-minimum-supported-app-version.md)). It is a compatibility gate, not a security
control: it reads the `X-App-Platform` and `X-App-Version` headers, which any client can set to
anything, and requests without `X-App-Platform` (curl, probes, any other client) pass. It stops
installed versions that can no longer work with the API; it keeps no attacker out.

## Input and output validation

Every body and query passes a Zod schema (`@ZodBody`, `@ZodQuery`); path ids pass `ParseUUIDPipe`.
A 400 names every field at fault in `errors` ([error-handling.md](error-handling.md)). Responses
select explicit columns (`USER_SELECT`, the items' select) and match the documented schema. Bodies
are capped at 100 kB (the body parser's default).

## SQL injection

Prisma parameterizes every query. Raw SQL only through tagged templates
(`` $queryRaw`...${value}` ``), never the `*Unsafe` variants with interpolated input: an ESLint rule
refuses them in the API, tests included. The one use, `$executeRawUnsafe` in the test reset helper
(`apps/api/test/app.ts`), interpolates table names read from the database catalog (identifiers
cannot be bound as parameters) and carries a disable comment that says so.

## Database access

The API needs a role that reads and writes data and cannot change the schema; the migration job
(the `api-migrate` image) needs the schema's owner. Neither should be a superuser, and each gets
only its own `DATABASE_URL`. The repository creates no roles: locally, Compose's `app` user serves
both. Creating them is per project (REQUIERE CONFIGURACIÓN), with TLS to the database when it is not
on a private network (`?sslmode=require`).

## Secrets

- Never in git: [SECURITY.md](../SECURITY.md#secrets) (ignored env files, the pre-commit hook,
  secretlint, gitleaks on the history); `apps/api/.env.example` holds placeholders only.
- Never in an image: the Docker build context is an allowlist (`.dockerignore`): the workspace
  manifests, the lockfile and `apps/`, minus env files, keys and certificates, logs, build output
  and the app's native projects. Anything else placed under `apps/` (a database dump, say) would
  still reach the build stage and its cache, so keep such files out of the repository tree; the
  final images get only what their Dockerfile copies.
- Never in logs: the access log has no headers, no bodies and no query strings; env validation
  errors name the variable, never the value; the 5xx log has the stack, not the request; and every
  line is redacted automatically ([Logging](#logging)). The access log does record the client IP
  and the user id (what an investigation needs): personal data in some jurisdictions, so log
  retention and access follow the project's data policy.
- In production: the platform's secret store, one value per environment
  ([environment.md](environment.md#secrets)). Rotation: [Secret rotation](#secret-rotation).
- A leaked secret is rotated first, then removed from history if needed; removal alone is not
  enough.

## Logging

Logs, error reports and spans leave the process; credentials must not. Three layers, in order:

1. **Nothing sensitive is logged on purpose:** the access log records method, path (no query
   string), status, duration, IP and user id; error lines record the stack; no code logs headers,
   bodies, tokens or env values (review rule, ENGINEERING_STANDARDS.md).
2. **Automatic redaction** (`observability/redact.ts`) of everything the logger prints, whatever a
   developer passes to it: values under sensitive keys (any key containing `password`, `passphrase`,
   `secret`, `token`, `authorization`, `cookie`, `apiKey`, `privateKey`, `accessKey`, `credential`,
   `signature` or `sessionId`, and `dsn`, in any letter case and at any depth), and credentials
   written inline in strings, error messages and stack traces: user:password in URLs (database,
   Redis, SMTP), `Bearer`/`Basic` values, JWTs, `token=`/`password=`/`apiKey=` pairs in query
   strings, cookies, JSON (JSON serialized inside a JSON string too) and pretty-printed objects
   (Prisma's error messages), PEM private keys, and well-known provider token formats. The logger,
   the error tracker's `beforeSend` and the span processor all use it. The patterns are linear-time
   (a hostile multi-megabyte string cannot stall the logger) and inputs are never mutated.
3. **Specs** prove it: `redact.spec.ts` (each pattern, objects, errors, cycles, a performance
   bound), `common/logging/logger.spec.ts` (JSON and text output never contain the planted
   secrets).

Redaction is a safety net, not a license: it recognizes credential shapes, not every piece of
personal data. Log ids, not emails, names or free text. The app's own redaction, for what leaves
the device, is in [SECURITY.md](../SECURITY.md#logging-and-reports).

## Error tracking data

When `SENTRY_DSN` is set (OPTIONAL), the API's reports go to a third party
([observability.md](observability.md#error-tracking)). What they may contain is decided in code:

- **Explicit context only.** The client has no breadcrumbs and no request data; each report carries
  the error, its stack and the fields the error filter passes: request id, method, route pattern,
  status, origin, an opaque user id, environment and release.
- **Collection off by category:** Sentry's data collection defaults collect cookies, headers,
  bodies, query strings, user details and local variables; the API switches each category off
  (`DATA_COLLECTION` in `observability/sentry.ts`) and types its options, so a renamed option fails
  the build instead of silently re-enabling a default.
- **Scrubbed again before sending** (`scrubEvent`): request reduced to method and URL without query,
  user to its id, breadcrumbs and stack frame variables dropped, every message and field through
  the log redaction.
- **Production DSNs must be https** (boot check); a malformed DSN fails the boot instead of turning
  error tracking off silently. Use a Sentry project of its own for the API (the app has another),
  restrict who can read it, and set the data retention the project's policy allows.
- Telemetry follows the same rules: spans carry statements with placeholders, never values; URL
  attributes lose their query string and credentials; values under a sensitive name are masked
  whole and every other string attribute (string arrays included) is redacted, on the span, on its
  events (exception messages and stack traces) and in its status message
  (`RedactingSpanProcessor`). The resource names the process (`service.instance.id`), not the
  machine: no host name or machine id unless the operator sets one. Provider credentials
  (`OTEL_EXPORTER_OTLP_HEADERS`) are read by the exporters from the environment, never by
  application code.

## Redis

OPTIONAL for the application ([architecture.md](architecture.md#redis)), and on by default in
development and in the `stack` profile. Secure defaults in both places:

| Concern             | Development (`pnpm dev`, `pnpm services:up`)                                           | Elsewhere (REQUIERE CONFIGURACIÓN)                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where               | a container on this machine (`docker-compose.yml`), shared by the `stack` profile      | a managed or private Redis (ElastiCache, Memorystore, Azure Cache, Upstash...) on the private network only, never a public endpoint                            |
| Network             | published on 127.0.0.1 only (port 6399)                                                | reachable from the API's network only (security groups, private endpoints)                                                                                     |
| Authentication      | a password (`REDIS_PASSWORD` in the root `.env`; `app` when unset, development only)   | an ACL user limited to the key prefix and the commands the adapters run (list in [architecture.md](architecture.md#redis)), its password from the secret store |
| Encryption          | none (loopback)                                                                        | TLS: `rediss://` (the API warns at boot about `redis://`, and about a URL without a password, in production)                                                   |
| Credentials in logs | never: the URL is logged without its credentials, errors are redacted                  | same                                                                                                                                                           |
| Persistence         | AOF every second, a volume                                                             | per use: cache and rate limits can lose data; locks and idempotency claims should survive a restart (AOF or the provider's persistence)                        |
| Memory              | 256 MB, evicts only keys with a TTL (`volatile-lru`)                                   | sized to the workload, with the same policy: every key the template writes has a TTL, so keys without one (a future job queue) are never evicted               |
| Process             | runs as the `redis` user; the password reaches it through a file, not the command line | the provider's hardening                                                                                                                                       |

The application treats Redis as untrusted for correctness: losing it degrades features but never
authorizes a request, and no session or authorization data lives there.

## Email

OPTIONAL infrastructure ([architecture.md](architecture.md#email),
[ADR 0005](adr/0005-transactional-email-outbox.md)). Development uses Mailpit, which accepts
anyone's mail without authentication: it is published on 127.0.0.1 only and is never part of a
deployment.

| Concern                | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport              | Production requires encryption: `smtps://`, or `smtp://` with STARTTLS required (a server without it, Mailpit among them, is refused); TLS 1.2 or later; the server's certificate is verified. The one exception is a server on the machine itself (`localhost`, `127.0.0.1`, `[::1]`: a local relay): that traffic never crosses a network, and `localhost` is connected to as `127.0.0.1`, never through a DNS answer. In production the API warns at boot when it uses the exception (a copied development setting). |
| Credentials            | In `MAIL_SMTP_URL`, a secret of the platform's store; the logger redacts `user:password@` in any URL, and the SMTP server's own text is never logged (only a category such as `smtp_5xx_535`).                                                                                                                                                                                                                                                                                                                          |
| Links                  | Built from `APP_ORIGIN` and `APP_BASE_PATH` only (required with email; https in production, http only on a loopback origin, where links open on that machine alone), never from a request's Host or forwarded headers: no password-reset poisoning (see [HTTPS](#https)).                                                                                                                                                                                                                                               |
| What the outbox stores | No message body and no token: the worker renders a message when it sends it, and a link's token is minted then, only its hash stored. The address is cleared once the message is sent or dropped (a CHECK constraint enforces it); a keyed hash (HMAC-SHA256, key derived from `JWT_ACCESS_SECRET`) stays for the per-address limits.                                                                                                                                                                                   |
| Logs, metrics, errors  | A message is named by its id and kind; an address appears at most as the first 12 characters of its keyed hash. Metric attributes are the kind and the outcome only. `mail status` prints no address. Database errors are logged by class and code, never their message (it can quote a query's arguments).                                                                                                                                                                                                             |
| Content                | Every value in a template is HTML-escaped; subjects carry no line break (no header injection); nothing remote is loaded (no image, font or stylesheet: no tracking pixel); nodemailer may not read files or URLs named in a message. `MAIL_FROM` is validated at boot, quotes and line breaks refused.                                                                                                                                                                                                                  |
| Abuse                  | Messages anyone can request are limited per mailbox (one a minute, `MAIL_DAILY_LIMIT_PER_ADDRESS` a day; a `+tag` counts as the same mailbox), counted in PostgreSQL so every instance shares them, on top of the routes' limits. Callers answer the same whatever was queued: no account enumeration through email. Security notices are never held back, and workers send them before the others.                                                                                                                     |
| Automatic replies      | `Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress: All` on every message (RFC 3834).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sender authentication  | REQUIERE CONFIGURACIÓN: SPF, DKIM and DMARC for the sending domain at the provider, before the first message; without them messages are spoofable and land in spam.                                                                                                                                                                                                                                                                                                                                                     |
| Retention              | Finished outbox rows (metadata: kind, status, attempts, timestamps, error category, keyed hash) are deleted after 30 days; a failed message's address is cleared after 7; a message never sent a day past its validity (email turned off since) is dropped and its address cleared. The sweep runs whether email is on or off.                                                                                                                                                                                          |

## Push notifications

OPTIONAL infrastructure ([architecture.md](architecture.md#push-notifications),
[ADR 0011](adr/0011-push-notifications-outbox.md)). Notifications go through Expo's push service,
which hands them to Apple (APNs) and Google (FCM).

| Concern                 | How                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who can send to a phone | Expo accepts a request for a token from anyone who knows it, unless the Expo account turns on enhanced push security: then only requests carrying `EXPO_ACCESS_TOKEN` (`Authorization: Bearer`, over HTTPS) are delivered. REQUIERE CONFIGURACIÓN in production: the token and the setting at expo.dev/settings/access-tokens.                                                                                                |
| Tokens                  | A push token identifies a device: it is stored (`devices`, unique) but never logged, put in a metric or returned; a device is named by its id. The app sends its token only to the API, with the session's access token.                                                                                                                                                                                                      |
| Registrations           | `PUT` and `DELETE /api/devices/{installationId}` need a session; the installation id is a UUID the app made. A registration moves the installation to the caller's account and takes the token from any other installation: a phone holds one account's notifications at a time. Only the caller's own installation can be removed; another account's answers 404, like a missing one ([authorization.md](authorization.md)). |
| Sign-out                | The app removes its installation before revoking the session, so the next person on a shared phone does not get the previous account's notices. Best effort: offline, the registration stays until another account registers on that phone, the token dies or 270 days pass; what it can receive is the templates' text, which names no one.                                                                                  |
| Content                 | Title, body and an internal `data.url` from a template, rendered at send time: never personal data or a secret (lock screens, three intermediaries). The app opens `data.url` only through its link allowlist, and only once signed in.                                                                                                                                                                                       |
| What the outbox stores  | Kind, account, device, ids, status and the category of the last failure (`DeviceNotRegistered`, `http_503`), never the service's text.                                                                                                                                                                                                                                                                                        |
| Retention               | Finished notifications are deleted after 30 days; a device whose token died, 30 days after; one not registered for 270 days. An account's devices and notifications go with it (cascade). The sweep runs whether push is on or off.                                                                                                                                                                                           |

## Dependencies

The API's dependencies live in the repository's one lockfile and pass the same controls as the
app's: the release delay, the trust policy, the install-script allowlist, registry-only sources,
the license policy and `pnpm audit` ([SECURITY.md](../SECURITY.md#dependencies),
[Dependency policy](../SECURITY.md#dependency-policy)). An advisory in a package the API's tree
pins is handled in the open, with a scoped override in `pnpm-workspace.yaml` that names it (one is
there now, for a package pinned by Prisma's configuration loader)
([Known advisories](../SECURITY.md#known-advisories)).

Dependabot also proposes the base images of `apps/api/Dockerfile`, the tool images CI runs
(`scripts/tool-images/Dockerfile`) and the images of `docker-compose.yml`, by tag and digest
together, after the same seven days. Some majors move by hand with what depends on them
([ci-cd.md](ci-cd.md#keeping-the-stack-current)): the Node.js base image follows `.nvmrc`, and
PostgreSQL and Redis move in CI and Compose together (PostgreSQL with its data).

## Container images

- The images run as a non-root user. The web image (`apps/landing/Dockerfile`) is
  nginx-unprivileged with the built landing and its configuration, nothing else: it writes only the
  app's link files, into `/tmp`, so it runs on a read-only root filesystem; its settings are checked
  before nginx starts (`18-validate-runtime-config.sh`), and a malformed one stops it. The API
  (`runtime`) and migration (`migrate`) images of
  `apps/api/Dockerfile` contain no Node.js package manager: npm, corepack and yarn are removed from
  the Node.js base (unused attack surface with advisories of their own); the operating system's
  package manager stays (apt in the Debian base; a distroless base would remove it too, OPCIONAL).
  The runtime image holds the production dependencies and the compiled API; the migration image the
  production dependencies (the Prisma CLI is one), the CLI's schema engine and the migrations, with
  no source code and no development tools. That engine is the one built for OpenSSL 3 and links
  Debian's `libssl3`, so the TLS of the migrations gets the system's fixes and the image scan sees
  it (the engine Prisma picks on a system without OpenSSL carries its own copy, out of reach of
  both: the build refuses it). The Prisma CLI's update check and usage data are off there
  (`CHECKPOINT_DISABLE=1`), in the image builds and in CI. Both images apply the operating system
  fixes published after their base was built (`apt-get upgrade`), so a fixed advisory in the base
  does not wait for the next base release. CI passes the day as `OS_UPGRADE_DATE`, part of that
  step's cache key: the build cache replays an upgrade for one day at most, never until the base
  digest changes.
- The files of an image belong to root: the user it runs as can read and run them, never change
  them. On the server (`deploy/vps/compose.yaml`) every container also runs with:
  - a read-only root filesystem, with a small `tmpfs` only where the process writes (`/tmp`, where
    the web image writes the app's link files; nginx's generated configuration; PostgreSQL's socket
    directory), emptied at every restart; the data of PostgreSQL, its backups and Redis on their
    own volumes;
  - no Linux capability (`cap_drop: [ALL]`), except Caddy's `NET_BIND_SERVICE` for ports 80
    and 443;
  - `no-new-privileges`, so a setuid binary grants nothing;
  - limits on processes and memory, so one runaway container cannot take the server down.

  An intruder in a container therefore cannot change the application, plant a persistent tool or
  gain privileges inside it. Another orchestrator should apply the same (REQUIERE CONFIGURACIÓN).

- CI's Images job builds the three images and scans each one with Trivy
  (`.github/workflows/docker-images.yml`, [ci-cd.md](ci-cd.md#images)); CI never pushes them. The
  Deploy workflow pushes them for the server target and scans the digest it pushed, the one it
  deploys ([ci-cd.md](ci-cd.md#deployment)). A HIGH or CRITICAL advisory **with a published fix**
  fails the build. Fix it by
  rebuilding (newer base patches), updating the base image (Dependabot proposes it weekly) or
  updating the dependency; unfixed advisories are reported by the tool but cannot be acted on.
- Base images are pinned by tag and digest in the Dockerfile: a tag moved on the registry changes
  nothing until Dependabot proposes the new digest in a pull request that runs the full CI. Every
  build still applies the operating system fixes published since (above). The Dockerfile names
  Node.js from ECR Public's mirror of Docker's official images
  (`public.ecr.aws/docker/library/node`), the same image and digest as on Docker Hub, without its
  anonymous pull limit; CI pulls that digest through `mirror.gcr.io` (`scripts/tool-image.mjs`),
  since ECR Public limits anonymous pulls per address too and runners share theirs.
- Locally, after `docker compose --profile stack build`:
  `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$(node scripts/tool-image.mjs trivy)" image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed <image>`.

## Repository and delivery

- **Rulesets** (`.github/rulesets/`): `main` takes changes through reviewed pull requests only
  (linear history, stale approvals dismissed, the last push approved by someone else, code owners'
  approval once `CODEOWNERS` is filled in), and the **CI passed** and **Conventions** checks count
  only when GitHub Actions reports them (`integration_id`), not a status anyone with a token can
  post. Release tags `v*` cannot be moved or deleted.
- **CODEOWNERS** lists the security-sensitive paths of the API (authentication, the guards and the
  HTTP pipeline, redaction and error tracking, configuration, the schema and the contract) next to
  the app's and the gates' (`.github/`, hooks, scripts): owning the checks is what keeps them from
  being edited away in the same pull request.
- **Deploy** (`deploy.yml`) resolves the requested ref to a commit, refuses one that is not on
  `main`, re-runs every gate on that exact commit and releases that commit only, with the image
  digests its own build reported or an earlier run of it from `main` recorded: never the registry
  tag `<image>:<sha>`, which any workflow with `packages: write` can push from any branch
  (`scripts/recorded-images.mjs`). The workflow file's own checks can be edited on a branch, so the
  `staging` and `production` environments must also allow deployments from `main` only
  ([ci-cd.md](ci-cd.md#environments)). How the app's builds are protected:
  [ci-cd.md](ci-cd.md#what-protects-production).

## Static analysis

The repository's gates ([SECURITY.md](../SECURITY.md#static-analysis)) cover the API:

| Layer                          | Runs                                          | Blocks | Catches in the API                                                                                                  |
| ------------------------------ | --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| ESLint `strictTypeChecked`     | `pnpm verify`, pre-commit, CI                 | yes    | unsafe `any` flows, floating promises; `eval`/`new Function`, raw-SQL `*Unsafe` calls, raw `process.env`            |
| Semgrep (`pnpm sast`)          | CI on every pull request; locally with Docker | yes    | OWASP Top 10 patterns in TypeScript, Node.js, Express and JWT code; hard-coded secrets; Dockerfile misconfiguration |
| zizmor (`pnpm lint:workflows`) | CI on every pull request; locally with Docker | yes    | GitHub Actions: excessive permissions, template injection, unpinned or impostor actions, persisted credentials      |
| CodeQL                         | CI, opt-in (`ENABLE_CODEQL`)                  | no     | Cross-file data flow (taint) from requests to dangerous sinks; results in the Security tab                          |

Any finding fails. A false positive is suppressed on its line with the reason, which review sees:
`// nosemgrep: <rule-id> -- why it is safe`. The rulesets are fetched from the Semgrep registry at
each run, so a new rule can flag existing code; fix or suppress it in its own pull request.

## Dynamic analysis

`.github/workflows/dast.yml` runs **OWASP ZAP** against the running server side (ADVISORY: not a
required check):

- **Weekly and on demand, against a throwaway stack** built from the production images on the CI
  runner (`docker compose --profile stack`): after the smoke test, the baseline scan (passive:
  headers, cookies, disclosures) on the public site (the landing, the open-in-app page, the app's
  link files), and the API scan (active: injection, XSS, path traversal) on every operation of
  `openapi/openapi.json`, the API the app calls.
- **On demand against staging** (`DAST_STAGING_URL`, REQUIERE CONFIGURACIÓN): the baseline scan
  only, which sends nothing a normal visitor would not. Never run active scans against a shared
  environment without its owners' agreement.

Rule levels live in `.zap/rules.tsv`: FAIL for what the template guarantees (security headers, no
version or error disclosure, no injection, no cookie at all: sessions are tokens the app keeps),
WARN for what depends on the deployment (HSTS at the edge) or deserves a look (a comment in the
landing's HTML), IGNORE for informational noise, each with its reason. Reports are kept 30 days as
the `zap-reports-*` artifact. The scans are unauthenticated: they reach what an anonymous client
reaches; authenticated scanning is per project (OPCIONAL: a ZAP context with a test account and
its bearer token). The app itself is not in reach of ZAP: its own checks are in
[SECURITY.md](../SECURITY.md) (MASVS).

## Artifact integrity

| What                                    | Status                              | How                                                                                                                                                                                                             |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lockfile integrity                      | Obligatorio                         | sha512 per package, frozen installs, registry sources only ([Dependency policy](../SECURITY.md#dependency-policy))                                                                                              |
| SBOM of each release                    | Obligatorio                         | CycloneDX of the npm packages the production dependencies resolve to at the tag, attached to the GitHub release by `release.yml` (`pnpm sbom:generate` locally)                                                 |
| Scanned image = shipped image           | Obligatorio                         | The server deployment scans the digest it pushed and deploys that digest from the run's record; production reuses staging's record, never the mutable tag, and scans it again                                   |
| SBOM and provenance of published images | Obligatorio once images are pushed  | BuildKit attestations (`sbom: true`, `provenance: mode=max`) on every push (the `publish` job of `deploy.yml`, `docker-images.yml` with `push: true`), in the image index whose digest is recorded and deployed |
| Signed attestations (Sigstore)          | OPCIONAL                            | `actions/attest-build-provenance` step ready (commented) in `docker-images.yml`. Needs a public repository or GitHub Enterprise Cloud                                                                           |
| Verification before deploying           | OPCIONAL (with signed attestations) | `gh attestation verify oci://<image>@<digest> --repo <owner>/<repo>` in the deployment                                                                                                                          |

Signing with a separate tool (cosign with keys) is not included: GitHub attestations are already
Sigstore signatures, verifiable without managing keys. To see what a pushed image carries:
`docker buildx imagetools inspect <image>@<digest> --format '{{ json .Provenance }}'` (or
`.SBOM`).

**Which SBOM describes what runs.** The release's CycloneDX file lists the npm packages of the
lockfile that the production dependencies need, peer dependencies included (so a few build tools
appear): what a review of the code's dependencies needs, the same whenever the tag is built. It
does not list what an image adds (the Debian packages, Node.js), and it names no image. Each
pushed image's own SBOM does: BuildKit scans the image's files when it is built and stores an SPDX
document, with the SLSA provenance of the build (the commit, the Dockerfile, the build arguments,
the base images), in the image index next to the image.

**What an SBOM proves, and what it does not.** It is an inventory: the components a scanner found,
with versions and identifiers, so a new advisory can be matched against what runs and "do we ship
X?" has an answer. It does not prove that the components are free of vulnerabilities (the Trivy
scan covers the known ones that have a fix), nor that the list is complete (code copied outside a
package manager, or linked into a binary, can be missed), nor who built the artifact or from what
(that is the provenance), nor that nobody changed it: BuildKit's attestations are not signed. They
are worth what the digest that leads to them is worth. A signed attestation (above) lets anyone
check where an image comes from.

## Known limits

Accepted on purpose, each with its way out:

- **Access tokens outlive a session revocation** by up to 15 minutes, except a password change or
  reset, a change of email or its undo (`security_version`) and an account deletion, which end
  them at once. Way out: increment `security_version` for the other changes that need that (see
  [Authorization](#authorization)), or a shorter TTL.
- **Rate limits count per instance** with the default memory store (and while a Redis store is
  unreachable). The per-IP ceilings are sized for carrier NAT, so a credential-stuffing attack
  spread over many addresses from one IP can try up to 300 sign-ins a minute before the ceiling
  stops it, and one spread over many IPs is not stopped. Way out: `RATE_LIMIT_STORE=redis`, a
  CAPTCHA, MFA, or device attestation with server-side verification
  ([SECURITY.md](../SECURITY.md#advanced-device-controls)).
- **The reuse window** gives a token replayed within 30 seconds of its rotation a pair, until the
  legitimate client's next renewal ends the family ([Sessions](#sessions)). A renewal whose answer
  was lost and is retried more than 30 seconds later (the phone went offline right after sending
  it) reads as theft: the family ends and the user signs in again. That is the price of reuse
  detection (RFC 9700 accepts it); change `REFRESH_REUSE_LEEWAY_SEC` only with a reason.
- **A password change whose answer is lost** leaves the device with a revoked refresh token (every
  session ended, the new one never arrived): its next renewal answers 401 and the person signs in
  again with the new password.
- **Redaction recognizes credential shapes, not all personal data**: an email or a name written
  into a log message stays readable. Way out: log ids (review rule).
- **No MFA, no account lockout**: product work (see [Authentication](#authentication-and-tokens)).
  **Sign-up has no CAPTCHA:** automated sign-ups are bounded by the per-address limits and the
  per-IP ceilings and need a working mailbox to finish; a project that sees abuse adds a challenge
  (REQUIERE CONFIGURACIÓN). Someone can keep replacing the pending sign-up of an address they do
  not own (each costs them a request within the limits), delaying its owner's sign-up, never
  taking it.
- **The per-address email limits can be spent by anyone.** They keep a mailbox from being flooded
  (one message a minute, `MAIL_DAILY_LIMIT_PER_ADDRESS` a day, shared by password recovery and
  sign-up), and so whoever asks for that many messages for an address keeps further ones from it
  until the window passes: its owner's reset link waits too. Way out: a higher daily limit, a
  challenge on the public routes, or an operator-sent link.
- **An undo link outlives the change it undoes for 7 days**, by design (no later change can void
  it): the person who controls the previous mailbox in that window can take the address back.
  After the window, or if that mailbox is lost too, recovery is an operator's job.
- **A link stays where it was opened:** the mail client keeps the message, and a browser that
  opens the link instead of the app records the address with its token in its history (and its
  sync). On a shared device an unused link could be reopened from there until it expires; a used
  one is worth nothing. Way out: the short validities (30 minutes for a reset), and using links at
  once.
- **Provider-specific address forms** (Gmail's dots, other providers' aliases) are different
  mailboxes to the per-address limits; only `+tags` are folded. **No breached-password service:**
  the policy refuses the most used passwords from a local list, so a password leaked elsewhere but
  not common passes. Way out: a k-anonymity range check (OPCIONAL; it sends a hash prefix to a
  third party).
- **Email is delivered at least once**: a worker that dies after the SMTP server accepted a message
  and before recording it sends it again when its lease ends (same `Message-ID`). Links stay
  single-use, so a duplicate does no harm beyond the noise.
- **A deleted account survives in backups** until they rotate out
  ([Account deletion](#account-deletion)).
- **The minimum app version is not a security control**: any client can claim any version
  ([Minimum app version](#minimum-app-version)).
- **DAST is advisory and unauthenticated, and there is no penetration test**: the gates find
  known patterns, not logic flaws (an authorization rule that is wrong but consistent passes
  them). Way out: authenticated ZAP scans (OPCIONAL), and an external test of the API and the app
  before handling sensitive data.
- **Semgrep rules are fetched at each run** from its registry: CI needs it reachable, and a new
  rule can flag existing code (see [Static analysis](#static-analysis)).
- **No WAF or DDoS protection**: the edge's job (REQUIERE CONFIGURACIÓN).
- **Error tracking, tracing and alerting are prepared, not configured**: the alert rules ship as
  code, but without a Sentry project, an OTLP backend that loads them and a routing for their
  notifications, failures are only in the logs ([observability.md](observability.md)).

## Per project (REQUIERE CONFIGURACIÓN)

- [ ] `SECURITY.md`: a real private contact, and GitHub private vulnerability reporting enabled.
- [ ] TLS and HSTS at the edge; `TRUST_PROXY` for the real topology, and the API reachable only
      through its proxies ([HTTPS](#https)).
- [ ] `APP_ORIGIN` on an https domain the app claims (universal links and App Links), and the app's
      screens for the emailed links ([One-time tokens](#one-time-tokens)).
- [ ] `CORS_ORIGINS` only for a browser client on another origin
      ([CSRF, CORS, XSS](#csrf-cors-xss)).
- [ ] More than one instance: `RATE_LIMIT_STORE=redis` on a Redis they all reach, private,
      authenticated and over TLS; `RATE_LIMIT_MAX` sized for the carrier NAT the users sit behind
      ([Rate limiting](#rate-limiting)).
- [ ] Database roles: one for the API, one for the migrations, neither a superuser
      ([Database access](#database-access)).
- [ ] Error tracking (a Sentry project for the API), its access and retention; tracing backend and
      its credentials in `OTEL_EXPORTER_OTLP_HEADERS`.
- [ ] Production secrets per environment; who can read them; rotation.
- [ ] Push notifications: `EXPO_ACCESS_TOKEN` with enhanced push security turned on in the Expo
      account, before `PUSH_ENABLED` in production ([Push notifications](#push-notifications)).
- [ ] The account lifecycle the product needs (sign-up, MFA, lockout), the deletion request page
      Google Play asks for, and the app's deletion screen ([Account deletion](#account-deletion)).
- [ ] Data classification: which fields are personal data, retention, backups (and how long a
      deleted account survives in them), encryption at rest
      ([SECURITY.md](../SECURITY.md#data-the-api-keeps)).
- [ ] Image pushes and deployments by digest from `main` (the server target does both), the
      container hardening of another orchestrator, signed attestations where the GitHub plan
      allows ([Container images](#container-images)).
- [ ] The server's own database: its nightly backups copied off the server, with an alert when a
      copy is missing ([deploy-vps.md](deploy-vps.md#backups)).
- [ ] `DAST_STAGING_URL` once staging exists; authenticated scans if the product needs them
      ([Dynamic analysis](#dynamic-analysis)).
- [ ] CodeQL / dependency review / secret push protection, where the GitHub plan allows.
- [ ] The rulesets in `.github/rulesets/` applied, `CODEOWNERS` filled in, and the `staging` and
      `production` environments deploying from `main` only.
- [ ] Alerts on the signals the API already logs: `Refresh token reuse for user ...` (a stolen
      refresh token), bursts of 401 and 429 on `/api/auth/sign-in`, any `fatal` line, 5xx rate.
- [ ] Log retention and access (logs contain client IPs and user ids).
