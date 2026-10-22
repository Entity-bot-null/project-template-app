# 0005. Send email through a transactional outbox in PostgreSQL, over SMTP

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** template maintainers

## Context

This is the web template's ADR 0003 (`project-template-web` 2.0), adopted for the API
(`apps/api`), with one addition: the notice of an account deletion
([ADR 0012](0012-account-deletion.md)), a message that belongs to no account.

The account flows a product needs (password recovery, confirmation of a sign-up, a change of email
that can be undone, invitations, the deletion of an account) all end in a message. Each one changes
state and must tell a person about it, and the two must not drift apart: a token stored without its
message is a link nobody gets; a message sent for a change that rolled back is a lie. Links in
messages point to `APP_ORIGIN` + `APP_BASE_PATH` (default `/app`), which the app opens as universal
links and App Links. Email providers fail in ordinary ways (rate limits, outages, refused
credentials), and the API runs as several instances. The API must keep working with no email at
all (it ships without an account anywhere), keep every gate, stay off any one vendor, and add no
infrastructure a small project would not otherwise run. Security constraints come first: tokens
must never be stored in clear text, links must never be built from a request's Host, and nothing
may tell a client whether an address has an account.

## Options

1. **Send from the request** (an SMTP call before answering, or a promise left running after it):
   no new table; but the response time then reveals what was sent (account enumeration), a slow or
   failing provider slows or fails the request, a crash loses the message, and nothing retries.
2. **A job queue** (BullMQ on Redis, SQS, Pub/Sub): proven retries and scheduling; but it makes
   Redis (optional today) or a cloud account mandatory for email, and the job is not written in the
   same transaction as the change unless an outbox feeds the queue anyway.
3. **A provider's HTTP API** (SES, Postmark, Resend SDKs): richer features (templates, webhooks);
   but one vendor per project, a dependency per vendor, and the same delivery problem as above.
4. **A transactional outbox in PostgreSQL, delivered over SMTP by a worker in every API instance**:
   the message is a row written in the business transaction; workers claim rows atomically
   (`FOR UPDATE SKIP LOCKED`, a lease) and send them over SMTP with retries. No new service: the
   database is already required; SMTP works with every provider (and with Mailpit locally and in
   CI). Costs: a table and a polling worker of our own, and SMTP's at-least-once delivery.

## Decision

Option 4. A message exists if and only if the change that called for it committed, delivery
survives restarts and outages, several instances share the queue safely, and no new infrastructure
or vendor is required. Details that follow from the constraints:

- **No body and no token is ever stored.** A row holds the kind, the address (until the message is
  sent or dropped, then only an HMAC of it) and ids. The worker renders the message when it sends
  it, in a short transaction where a template may mint a link's token: only its hash is stored, the
  token exists only in the message in flight. A retry mints a new token, which replaces the previous
  one, so at most one link is valid.
- **No transaction is open during SMTP.** Claim, render (short transaction), send, record the
  outcome: every transition after the claim is fenced by it (status `sending`, same attempt).
- **Retries follow the SMTP reply**, not the library's error code (which reports a 451 and a 550
  alike): 4xx and connection failures back off exponentially with jitter, 5xx fails the message,
  refused credentials or TLS wait for a fix and reach the error tracker. Every claim counts an
  attempt, so a message that crashes its worker runs out of attempts. A message past its validity
  is dropped unsent, never delivered late.
- **Per-address limits live in the database** (one message a minute, a configurable number a day,
  for the kinds anyone can request), so they hold across instances without Redis; an advisory lock
  serializes concurrent requests for one address. Security notices are never held back.
- **A message about an account belongs to it** (`mail_messages.user_id`, `ON DELETE CASCADE`):
  deleting the account deletes its messages, sent or not. **The `account_deleted` notice belongs to
  no account**: it is queued in the deletion's transaction without a user, so the cascade that
  removes the account's other messages leaves it. Its address stays on the row until it is sent,
  then is cleared like any other; it carries no link and no secret, is never held back by the
  per-address limits, and is dropped if it cannot be sent within 24 hours. Without email
  configured, nothing is queued and the deletion still happens.
- **SMTP through nodemailer** (MIT-0, no dependencies): TLS required in production, file and URL
  access disabled, bounded timeouts. **Mailpit** catches mail locally (`pnpm dev`: SMTP on 1045,
  the inbox at http://localhost:8045) and in the integration job, where specs send real SMTP and
  read it back, and its chaos mode injects 4xx and 5xx replies.

## Consequences

- Easier: a feature sends email by queueing a kind in its transaction
  ([architecture.md](../architecture.md#email)); operators get `pnpm --filter api mail` (`status`,
  `test`, `retry`) and metrics; projects choose any provider by changing `MAIL_SMTP_URL`.
- Harder: delivery is at least once. A worker that dies after the server accepted a message and
  before recording it sends it again when its lease ends (with the same `Message-ID`); links stay
  single-use, so a duplicate is noise, not a risk. The worker polls every 5 seconds (or at once
  after a commit in the same instance), so a message may wait a few seconds.
- Throughput is one message at a time per instance: enough for transactional email (account
  flows), not for newsletters. A project that needs volume puts a queue behind the outbox
  (option 2 fed by option 4) without changing the features that enqueue.
- A provider's delivery events (bounces, complaints) are not read: SMTP acceptance is the last
  thing the API knows. A project that needs them adds the provider's webhooks.
- Finished rows (sent, expired, failed) are deleted after 30 days; until then a sent message keeps
  only the HMAC of its address. That includes rows that never belonged to an account (a sign-up's
  confirmation, an invitation, the deletion notice).
- We would know this was wrong if the outbox table grew faster than the worker drains it
  (`app_mail_outbox_oldest_age_seconds`; the readiness probe reports email as `degraded` while the
  oldest waiting message is older than 15 minutes), or if projects kept reaching for a provider's
  API for features SMTP cannot carry.
