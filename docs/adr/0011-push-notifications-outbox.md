# 0011. Send push notifications through an outbox in PostgreSQL, over Expo's push service

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** template maintainers

## Context

The app could already ask for the notification permission, get a push token and open a tapped
notification's link, but nothing stored the token or sent anything: the registration was left to
each project (REQUIERE CONFIGURACIÓN). The API sends security notices by email
([ADR 0005](0005-transactional-email-outbox.md)); a changed password is the notice a person should
also see on their phone, where they look first.

The constraints are the email outbox's: a notification exists if and only if the change that called
for it committed; delivery survives restarts and outages; several API instances share the work; no
new infrastructure a small project would not otherwise run; the API keeps working with push off.
And push's own: a phone's token belongs to one installation and can move between accounts (a
shared phone) or change (a reinstall, the service rolling it); Apple and Google refuse tokens of
uninstalled apps, and those must stop being used; the text passes through third parties and shows
on lock screens; the app signs out on phones that may then belong to someone else.

## Options

1. **Send from the request** to Apple and Google directly (APNs HTTP/2 with a `.p8` key, FCM HTTP
   v1 with a service account): no intermediary; but two protocols, two sets of credentials on the
   server, a lost notification when the request or the provider fails, and the response time tied
   to them.
2. **A third-party push platform** (OneSignal, Firebase's own console and SDK): segments,
   campaigns; but the app's users and tokens live in another vendor's database, an SDK with native
   code in the app, and the same transactional gap as option 1.
3. **A transactional outbox in PostgreSQL, sent through Expo's push service** by a worker in every
   API instance: the email outbox's design (a row per notification written in the business
   transaction, claimed with `FOR UPDATE SKIP LOCKED` and a lease, retried with backoff), with
   Expo's push service in front of APNs and FCM: one HTTPS API, one token format, batches of 100,
   receipts that report dead tokens. The FCM and APNs credentials stay in the EAS project, which
   the app's builds already need. Costs: a dependency on Expo's service (free, no SLA), its
   at-least-once delivery, and two tables of our own.

## Decision

Option 3. It reuses a design already proven in this API and its tests, adds no infrastructure and
no native dependency (the app already ships `expo-notifications`), and keeps the users and their
devices in the project's own database. Details that follow from the constraints:

- **Devices are installations.** The app names itself with a random id (`persistentStorage`) and
  registers its Expo push token for the signed-in account: `PUT /api/devices/{installationId}`,
  safe to repeat, at every start and sign-in once notifications are allowed. One row per
  installation and one per token: the same installation under another account moves to it, a token
  registered by another installation leaves its old row. At sign-out the app calls `DELETE` before
  the session is revoked, best effort and bounded to 3 seconds (the API answers 404 for another
  account's installation, like a missing one). Registration does not depend on `PUSH_ENABLED`.
- **A row per device, no text.** `push_messages` holds the kind, the account, the device and ids;
  the worker renders the title, the body and `data.url` when it sends, so nothing written to the
  database or the logs reads like a message, and the text never carries personal data (lock
  screens, three intermediaries). `data.url` is an internal path the app opens only through its
  link allowlist.
- **No transaction is open during a request to Expo.** Claim a batch, send it, record each ticket
  fenced by the claim; about 15 minutes later, claim the sent rows and read their receipts, fenced
  by the ticket. The HTTP client never retries a send by itself (a retried send could notify
  twice): the worker does, with the email outbox's backoff.
- **Dead tokens disable their device.** `DeviceNotRegistered`, in a ticket or a receipt, marks the
  device disabled (a later registration enables it again); it is counted apart and does not alert.
  Refused credentials (`InvalidCredentials`, `MismatchSenderId`, a 401 or 403) reach the error
  tracker: they fail every notification of a platform.
- **Expo's enhanced push security is supported** (`EXPO_ACCESS_TOKEN`): without it, anyone who
  learns a token can send to that phone through Expo.
- **Retention.** Finished notifications go after 30 days; a disabled device 30 days after its token
  died; a device that has not registered for 270 days (Firebase's stale-token age). An account's
  devices and notifications are deleted with it.
- **One kind ships:** `password_changed`, queued in the same transactions as its email (a change of
  password, a password reset, the undo of a change of email), valid for a day.

## Consequences

- Easier: a feature notifies a phone by queueing a kind in its transaction
  ([architecture.md](../architecture.md#push-notifications)); operators get
  `pnpm --filter api push status`, metrics `app.push.*`, two alerts and a runbook
  ([incident-response.md](../incident-response.md#19-push-notifications-not-delivered)); the app
  needs no registration code of its own.
- Harder: delivery is at least once (a worker that dies after Expo accepted a batch sends it again
  when its lease ends); a notification is only as reliable as Expo, Apple and Google, so anything
  that matters goes by email too; push needs real devices to try (no token on emulators and
  simulators) and the EAS project's credentials.
- Must be done per project (REQUIERE CONFIGURACIÓN): `eas init`, the FCM V1 key and the
  `google-services.json` file variable for Android, an APNs key for iOS, `PUSH_ENABLED` and
  `EXPO_ACCESS_TOKEN` on the API.
- We would know it was wrong if Expo's service became a bottleneck or a risk (rate limits, an
  outage that matters): the outbox and the worker stay, and only the client
  (`infrastructure/push/expo-push.client.ts`) changes, to APNs and FCM directly (option 1's
  protocols, with the outbox's guarantees).
