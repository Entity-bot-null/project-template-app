# 0007. Carry mobile sessions in the response body, with rotating refresh tokens and a reuse window

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

The web template keeps the refresh token in an httpOnly cookie (`__Host-refresh_token` in
production): page scripts cannot read it, and the browser's cookie jar, shared by every tab, holds
the one current token. The API ported from it (`apps/api`) serves a native app instead, and three
things change:

- **A native app has no cookie jar it controls.** React Native's networking leaves cookies to the
  platform's store, outside the Keychain and Keystore where the app keeps its secrets, and
  `httpOnly` defends against scripts injected into a page, which a native app does not run. The app
  already keeps the refresh token in SecureStore (Keychain / Keystore, this device only) and the
  access token in memory only ([SECURITY.md](../../SECURITY.md#storage)); it must send the token in
  the body.
- **Mobile networks lose answers.** A renewal can reach the API, rotate the token, and its answer
  never arrive: a dropped connection, a switch between Wi-Fi and cellular, the app suspended
  mid-request. The device then holds only the token it sent, which strict rotation reads as stolen.
- **The token must still be protected.** RFC 9700 (OAuth 2.0 Security Best Current Practice) asks
  that the refresh tokens of public clients, which a native app is, be sender-constrained or
  rotated, so that a copy used by someone else is detected.

## Options

1. **A cookie anyway**, through the platform's cookie store or a WebView: the token outside secure
   storage, its lifetime in a store the app does not manage, and, with a WebView, the session split
   between two cookie stores.
2. **No rotation**: a refresh token works until it expires; a copy works as well as the original,
   and nothing tells them apart, so a theft is never detected.
3. **Long-lived refresh tokens** (months), or long-lived access tokens without refresh: fewer
   renewals, so fewer lost answers; a stolen token works for months, and nothing short of a
   credential change ends it.
4. **Strict rotation without a window**: every token works once, any second use ends its family.
   A renewal whose answer was lost, an ordinary event on a phone, signs the person out and is
   logged as theft.
5. **Rotation where a retry gets the same answer again**: the server would have to keep the
   successor readable to send it twice; it keeps only hashes.
6. **The web template's window**: a token presented again within 30 seconds of its rotation answers
   401 and leaves the session alone. Right for browser tabs sharing one cookie jar; wrong for a
   phone (below).
7. **Tokens in the body, rotation with family revocation, and a 30-second reuse window in which a
   retried renewal replaces the answer it lost.**

## Decision

Option 7.

**Tokens in the body.** `POST /api/auth/sign-in`, `POST /api/auth/sign-ups/confirm`,
`POST /api/auth/invitations/accept` and `POST /api/account/password` answer a session
`{ accessToken, refreshToken, expiresIn, user }` (schema `Session`; `user` is a `SessionUser`: id,
email, name, role). `POST /api/auth/refresh` and `POST /api/auth/logout` take `{ refreshToken }`.
The refresh token is 32 random bytes in base64url (43 characters, validated as
`^[A-Za-z0-9_-]{43}$` before any lookup) and is stored as its SHA-256 only. The access token lives
15 minutes; the refresh token 30 days, renewed by each rotation, never past 90 days from its
sign-in. The API sets no cookie. `CORS_ORIGINS` is empty by default and CORS never allows
credentials. `FetchMetadataGuard` stays: native clients send neither `Sec-Fetch-Site` nor `Origin`
and pass; it stops other sites from making a browser call the API.

**Families.** Every sign-in starts its own family, so each device has its own and signing in again
ends no other device. A device ends its own session with a logout.

**Rotation with family revocation** (RFC 9700). Each refresh token works once: a renewal revokes
it as rotated and creates its successor in the same family. A token presented again after its
rotation, outside the window below, means someone else holds a copy: its whole family ends, and
the API logs `Refresh token reuse for user <id> (at refresh|logout)`.

**The reuse window: 30 seconds** (`REFRESH_REUSE_LEEWAY_SEC` in
`apps/api/src/auth/auth.constants.ts`, logic in `apps/api/src/auth/sessions.service.ts`). A token
presented again within 30 seconds of its rotation, while the successor that rotation created was
never used, is a retried renewal whose answer was lost:

- it gets a new pair;
- the unused successor is revoked and marked `superseded`;
- the retried token's `replacedById` points at the new successor;
- the window keeps the first rotation's time: retries never stretch it.

A superseded token presented later means two clients hold the family: the family ends. Past the
window, or within it once the successor has been used, a second use is reuse: the family ends. The
`sessions` table gains `replaced_by_id` (unique, a self-relation, `ON DELETE SET NULL`) and
`superseded` (migration `20261021190000_add_session_rotation`).

**Concurrency.** Every change to a user's sessions takes the user's row lock first
(`SELECT ... FOR UPDATE` on `users`), then reads again what it is about to change. Transactions
pin READ COMMITTED, so that second read sees what the transaction it waited for committed, whatever
isolation the database defaults to. Two renewals of one token are therefore serialized: the first
rotates it; the second finds it rotated moments ago with an unused successor, a retry within the
window. Both answer 200, and the **last** pair is the live one (the first is superseded): that is
the answer the phone waits for, since it gave up on the first request before sending the second.
The family is never left without a live session, and never has two. A logout racing a renewal of
the same token leaves no live session.

**Why the web answers 401 within its window and the app cannot.** In the web template the window
covers two tabs renewing with the same cookie at once: the loser gets 401 and its cookie is not
cleared, because the winner's answer already put the successor in the cookie jar every tab shares.
A phone whose answer was lost has no such jar: the successor existed only in the response it never
received. A 401 would leave it with a token that can never work again, and a dropped connection
would sign the person out.

## Consequences

- **The window's trade-off.** Within 30 seconds of a rotation, a stolen copy of the rotated token,
  replayed before the legitimate client uses its successor, gets a pair. The theft is detected at
  the legitimate client's next renewal: its successor is superseded, presenting it ends the family,
  and the attacker's pair with it. Strict rotation would have ended the family at the replay. What
  remains is the exposure every rotation scheme already has for a token stolen and used before its
  owner renews: the attacker holds the family until the legitimate client renews (shortly before
  its access token expires, and at the latest when the app next starts, since that token lives in
  memory only). Access tokens already issued live until they expire (15 minutes): ending a family
  revokes refresh tokens, not access tokens; only a credential change ends those at once
  ([ADR 0006](0006-security-version-in-access-tokens.md)).
- **The window's length.** The app does not retry a failed renewal by itself: the next request that
  needs a token renews again, with the same stored token. When that happens more than 30 seconds
  after the rotation whose answer was lost (the phone still offline, the app closed), the family
  ends as on reuse, and the person signs in again.
- **Logout** answers 204 and is idempotent: it ends the family of the presented token whatever its
  state, and an unknown, expired or already revoked token answers the same. A token rotated within
  the window (a logout after a renewal whose answer was lost) still ends the current session.
  Presenting a superseded token, or one rotated before the window, is also logged as reuse. A
  logout that fails on the server answers 5xx, so a client can tell it from success and retry it.
  The app forgets the session either way (its tokens leave memory and secure storage); a family
  whose logout never arrived ends with its expiry. An access token stays valid at the API until it
  expires.
- The app must renew one request at a time: two independent renewals from one device would
  supersede each other's answers. It does (`apps/mobile/src/auth/session.ts`: concurrent requests
  share one renewal).
- A device that is never signed out keeps its family until it goes 30 days unused or reaches the
  90-day end; a password change ends every family of the account. Expired rows are swept every
  hour.
- Renewals are limited per refresh token, not per client IP alone: phones behind carrier NAT share
  addresses ([security.md](../security.md#rate-limiting)).
- Tests: `apps/api/src/auth/sessions.service.spec.ts` (a token presented again: within the window,
  retried again, past it, with its successor used, superseded) and
  `apps/api/src/auth/auth.int.spec.ts` (a renewal whose answer was lost, concurrent renewals
  whatever isolation the database defaults to, a logout racing a renewal, logout semantics).
- Wrong if the reuse log shows families ending for legitimate clients whose retries come later than
  30 seconds: then widen the window, and with it the exposure above, or sender-constrain the token
  instead (RFC 9700's other option: a device-bound key that signs each renewal), which makes a
  copied token useless without the device.
