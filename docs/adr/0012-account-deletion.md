# 0012. Delete accounts at their owner's request, for good, in one transaction

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

Both stores require account deletion from apps that let people create an account
([store-compliance.md](../store-compliance.md)):

- **Apple**, App Review Guideline 5.1.1(v): an app that supports account creation must offer
  account deletion within the app. Apple's guidance on it asks to delete the entire account record
  with its associated personal data (offering only to deactivate or disable the account is not
  enough), allows re-authentication and confirmation steps, rejects apps that make deletion
  unnecessarily difficult, and asks to tell people what is retained when the law requires keeping
  something.
- **Google Play**: an app that allows account creation must offer an in-app path to delete the
  account and its associated data, and a web link where people can request the same without
  reinstalling the app. Data kept for legitimate reasons (security, fraud prevention, regulatory
  compliance) must be disclosed, for example in the privacy policy.

The API creates accounts from the app: public sign-up (`SIGN_UP_ENABLED`, off by default) and
invitations accepted in the app. An account owns its items, sessions, one-time links and queued
messages, and an administrator's account also vouches for the invitations it sent.

## Options

1. **Soft delete with a grace period** (a `deleted_at` column, a purge after N days, a sign-in
   within them restores the account): mistakes can be undone; but every query must leave deleted
   rows out, the data stays for the whole period (which people must be told), and a scheduled purge
   is one more job to run and watch.
2. **Anonymization** (keep the row, replace the address and name, drop the password): keeps
   references for history and audit; but the rows still describe a person (the items' content and
   times), so they are pseudonymous at best, and nothing in the template needs a dead account's
   rows.
3. **Deletion confirmed by email** (a link to the address, the account deleted when it is opened):
   proves control of the address; but it makes deletion depend on email, which the API can run
   without, adds a step Apple asks not to make difficult, and locks out a person who lost the
   mailbox.
4. **Hard delete at once, confirmed with the password, in one transaction.**

## Decision

Option 4: `POST /api/account/deletion` with `{ password }` answers 204
(`apps/api/src/account/account.service.ts`).

- **The password is checked again**: a session alone is not enough, it may be someone else's (an
  unlocked phone). A wrong password answers **403, not 401**, as a password change does: the session
  is fine, the confirmation is not, and a 401 would make the app renew its session and send the
  request again.
- **One transaction** (READ COMMITTED): administrators' deletions are serialized by an advisory lock
  (across instances), then the user's row lock is taken and the account read again: deleted
  meanwhile answers 404, a password changed since it was checked answers 409. If the account is the
  only administrator, the answer is **409** ("The only administrator cannot delete their account"):
  nobody could invite or manage anyone. Otherwise the user row is deleted (`DELETE`), and the
  database cascades take its items, sessions, one-time links (`account_tokens`) and queued messages.
  Invitations it sent keep their row, with the inviter set to null.
- **A notice** of kind `account_deleted` is queued in the same transaction, with no user: the
  address stays on the outbox row until the message is sent, then is cleared like any other
  ([ADR 0005](0005-transactional-email-outbox.md)). It carries no link and no secret, and tells a
  person who did not ask for the deletion that someone knew their password. The same notice goes
  to every previous address that could still undo a change of email (a notice of the change still
  queued, or an undo link still working), so a deletion right after a takeover is not silent.
  Without email
  configured, the deletion happens without it. The new kind arrives with migration
  `20261021190200_add_account_deletion`.
- **Every session ends at once:** every access token stops working (the guard finds no account,
  [ADR 0006](0006-security-version-in-access-tokens.md)), and every refresh token too (their
  session rows are gone). The app then signs out locally.
- **Visibility:** the metric `app.account.deletions` (a counter without attributes;
  `app_account_deletions_total`) and the log line `Account <id> deleted by its owner`. The route is
  limited to 5 attempts per 15 minutes per user ([security.md](../security.md#account-deletion)).

## Consequences

- Backups keep the account until they rotate out: the privacy policy must say so, with how long
  backups are kept.
- The audit trail is the log line with the user's opaque id and the metric: the API keeps no record
  of who the account was. Logs and error reports already sent keep that id until their own
  retention, never the address ([security.md](../security.md#logging)). A project that must keep
  proof of a deletion, or some data for legal reasons, adds it explicitly and says so in its privacy
  policy.
- Outbox rows that never belonged to the account (a sign-up's confirmation, an invitation, the
  deletion notice itself) are not deleted with it: once sent they keep only an HMAC of the address,
  and are deleted after 30 days.
- Invitations sent by a deleted administrator stop working: accepting one requires its inviter to
  still be an administrator. They stay listed, inviter unknown, until revoked or replaced.
- The address is free again: it can sign up or be invited as a new account, with nothing of the
  old one.
- A deletion cannot be undone, whether by mistake or by someone who knew the password; the notice
  tells the address at once.
- What the stores check is the project's: the in-app screen (in settings: the password, a
  confirmation, this route, then a local sign-out) and the web page Google Play asks for.
- Tests: `apps/api/src/account/account.int.spec.ts` (everything owned deleted, every device signed
  out, the notice sent; a wrong password; the last administrator) and
  `apps/api/src/account/account.service.spec.ts`.
- Wrong if a product needs to undo deletions or keep an account's records (a marketplace's
  transactions, regulated data): then a grace period or anonymization of those records, in a new
  ADR.
