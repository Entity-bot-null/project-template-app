# 0006. End access tokens at once on a credential change, with a security version

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

This is the web template's ADR 0004 (`project-template-web` 2.0), adopted for the API
(`apps/api`), whose client is a native app instead of a browser.

Access tokens are JWTs verified offline, valid for 15 minutes. Ending a user's sessions revokes
their refresh tokens, but every access token already issued would keep working until it expired.
For a password reset that window is the problem itself: the person resets because someone else may
be signed in, and that someone keeps full access for up to 15 more minutes. OWASP ASVS (session
management) and NIST SP 800-63B-4 expect the other sessions to end when a credential changes.

There are no cookies here. The app keeps its access token in memory and its refresh token in the
Keychain or Keystore ([ADR 0007](0007-mobile-sessions-with-refresh-tokens-in-the-body.md)): the API
cannot clear anything on a device, so a session ends on a device only when the API refuses its
tokens. The flows that must end access are a password change, a password reset, a change of email
(confirmed, or undone from the previous address) and the deletion of the account.

## Options

1. **Keep offline verification, shorten the TTL** (for example to 2 minutes): no lookup; but the
   window only shrinks, and every device renews far more often (one rotation every 2 minutes per
   device in use, each one a write and a request over a mobile network).
2. **A denylist of token ids** (`jti`) in Redis or PostgreSQL: precise per token; but it needs an
   id on every token, a list kept until each token expires, and Redis, optional, becomes
   load-bearing for security, or a table write per revocation and a lookup per request anyway.
3. **A per-user security version**: `users.security_version`, carried in the token (`sv`) and
   compared on every authenticated request (one primary-key lookup); incremented in the same
   transaction as any change that must end access. One integer per user, no list, no new
   infrastructure; one-time tokens record it too, so a link minted before a change stops working.

## Decision

Option 3. It ends access exactly when the change commits, uses the database the guard can already
reach (`apps/api/src/auth/jwt-auth.guard.ts`), and gives every flow the same lever: increment the
version in the change's transaction.

- A password change (`POST /api/account/password`), a password reset, a confirmed change of email
  and its undo increment the version and revoke every session of the account, in one transaction
  under the account's row lock. A deleted account needs no version: the guard finds no account.
- **A password change ends every access token at once, this device's included.** The device that
  made the change gets a new session in the response body (`Session`: access token, refresh token,
  user) and carries on with it; every other device's next request gets 401, its renewal fails (its
  session was revoked in the same transaction), and it is signed out.
- A sign-in checks the password before its transaction; the session is created only if, under the
  account's lock, the password is still the one checked. A sign-in with the old password therefore
  never outlives the change.

## Consequences

- Every authenticated request costs one indexed read of `users` (by primary key). The guard answers
  401 when the account is gone or its version moved; the app's 401 handling renews once
  (`apps/mobile/src/auth/session.ts`), and after a credential change that renewal fails too, so the
  device signs out.
- The API cannot authenticate a request with the database down. It already could not serve one:
  every protected route reads it.
- The version is not a counter of anything else: never reset it, never decrement it (a CHECK keeps
  it non-negative). Tests mint tokens with `asUser(app, id, role, sv)` (`apps/api/test/auth.ts`).
- The role is a claim of the access token: a role changed outside these flows (the API has no route
  that changes one) applies at the next renewal, unless the change also increments the version.
- Wrong if the lookup shows up as a meaningful share of request latency: then cache the version per
  instance for a few seconds (bounded staleness) or move it to Redis, keeping the same claim.
