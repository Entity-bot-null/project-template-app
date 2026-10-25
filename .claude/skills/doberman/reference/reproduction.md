# Reproducing a suspected bug

A suspicion becomes a finding when a test shows it. This guide is for this template's test stack
([docs/testing.md](../../../../docs/testing.md)): Jest + React Native Testing Library 14 and the
helpers of `apps/mobile/src/test/` in the app; Vitest unit specs and supertest integration specs
(the helpers of `apps/api/test/`) in the API; Vitest in the landing.

## Contents

- [Rules](#rules)
- [The file](#the-file)
- [Running and classifying](#running-and-classifying)
- [App patterns](#app-patterns)
- [API patterns](#api-patterns)
- [Landing patterns](#landing-patterns)
- [Validating the fix (optional)](#validating-the-fix-optional)
- [What cannot be reproduced here](#what-cannot-be-reproduced-here)

## Rules

1. The test asserts the **correct** behavior: it fails while the bug exists and passes once it is
   fixed. A test that asserts the bug ("expect the stale value") proves nothing about a fix.
2. Realistic, through the real code. App: stub the network (`stubFetch`), not the unit under
   review; render the real screen or hook with the real query client, session and HTTP pipeline.
   API: the real application over HTTP (`createTestApp`) against the test database, or the real
   service class with fakes only for what is outside it.
3. Model time and order explicitly: held responses (`deferred()`), responses released out of order,
   aborts, a response that never comes, two requests at once (`Promise.all`). An instant stub hides
   races; a stub that ignores the abort signal hides cancellation bugs (see
   [abort-aware responses](#abort-aware-responses)).
4. Never edit an existing file (test, helper or production code) to reproduce. Everything the test
   needs goes inside the temporary file.
5. One scenario per test, named after the expected behavior.

## The file

- Names: `<subject>.doberman.spec.tsx` (or `.ts`) for the app, **inside `apps/mobile/src/`** next
  to the code under test (Jest only collects `apps/mobile/src/**/*.spec.ts(x)`, and the `@/` aliases
  resolve there); `<subject>.doberman.spec.ts` for API unit specs and
  `<subject>.doberman.int.spec.ts` for API integration specs inside `apps/api/src/`;
  `<subject>.doberman.spec.ts` inside `apps/landing/src/` for the landing (never in `src/pages/`,
  where a file becomes a page). Each runner only collects its own app's `src/`.
- First line, exactly this marker (the clean step deletes only marked files). The app's shared
  setup:

```tsx
// DOBERMAN-TEMPORARY: reproduction for <finding id>, deleted by `doberman.mjs clean`.
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { user } from '@/test/fixtures';
import { deferred, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

let fetchStub: StubbedFetch;

beforeEach(async () => {
  fetchStub = stubFetch({});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});
```

## Running and classifying

Paths are relative to the package (`apps/mobile`, `apps/api` or `apps/landing`):

```sh
pnpm --filter mobile exec jest --coverage=false --runTestsByPath <file> > "<logDir>/repro-<id>.log" 2>&1; echo "DOBERMAN_EXIT=$?"
pnpm --filter api exec vitest run src/<path>.doberman.spec.ts > "<logDir>/repro-<id>.log" 2>&1; echo "DOBERMAN_EXIT=$?"
pnpm --filter api exec vitest run --config vitest.config.int.ts src/<path>.doberman.int.spec.ts > "<logDir>/repro-<id>.log" 2>&1; echo "DOBERMAN_EXIT=$?"
pnpm --filter landing exec vitest run --coverage=false src/<path>.doberman.spec.ts > "<logDir>/repro-<id>.log" 2>&1; echo "DOBERMAN_EXIT=$?"
```

API integration specs need the development services (the plan's `services`: `pnpm services:up`)
and run on `<db>_test`.

Read the log, then classify:

| Status         | When                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| REPRODUCED     | the test fails **on the assertion that encodes the expected behavior**, with the wrong value the bug predicts (quote it as evidence)      |
| NOT REPRODUCED | the test passes: the code handles the scenario. Drop the finding, or keep it UNVERIFIED only if the test could not model the real timing  |
| UNVERIFIABLE   | the scenario cannot be expressed here (native behavior, real device timing, infrastructure only production has): say what would settle it |

A failure for any other reason (import error, type error, missing database, a helper misused, a
timeout in setup) is not a reproduction: fix the test and run it again. Before calling something REPRODUCED, read the
failing assertion and check that it fails for the reason the finding claims.

Delete the file once its result is recorded (or leave it for the clean step, which deletes every
marked file).

## App patterns

All of these use the real hooks, screens and session; only `fetch` is replaced.

### Late response after sign-out or a user switch

```tsx
it('never shows the previous user data after a sign-out and a new sign-in', async () => {
  const late = deferred();
  fetchStub.on('GET /api/users/me', () => late.promise);
  await renderWithProviders(<ScreenUnderReview />);

  await act(async () => {
    await endTestSession(fetchStub); // user A signs out while the request is pending
  });
  fetchStub.on('GET /api/users/me', () => ok({ ...user, email: 'b@example.com' }));
  await signInForTest(fetchStub); // user B signs in

  await act(async () => {
    late.resolve(ok({ ...user, email: 'a@example.com' })); // A's answer lands now
  });
  expect(screen.queryByText('a@example.com')).toBeNull();
});
```

Persisted variant: after the sign-out, read the storage key directly
(`persistentStorage.getItem(...)`, `secureStorage.getItem(...)`) and expect it gone.

### Responses out of order

```tsx
it('shows the result of the newest search, not the slowest one', async () => {
  const first = deferred();
  const second = deferred();
  const pending = [first, second];
  fetchStub.on('GET /api/items', () => (pending.shift() ?? first).promise);
  // …type "a", then "ab" (fake timers for a debounce: jest.useFakeTimers + act(() => jest.advanceTimersByTime(n)))
  await act(async () => {
    second.resolve(ok(page(0, 1, 1))); // newest answers first
  });
  await act(async () => {
    first.resolve(ok(page(5, 1, 1))); // oldest answers last
  });
  expect(screen.getByText('Item 0')).toBeOnTheScreen();
  expect(screen.queryByText('Item 5')).toBeNull();
});
```

### Abort-aware responses

`deferred()` ignores the request's abort signal; real `fetch` rejects with an `AbortError`. When the
finding is about cancellation, answer through a handler that honors the signal, and assert on
`request.signal.aborted` of the recorded requests:

```tsx
function abortable(request: Request, response: Promise<Response>): Promise<Response> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (request.signal.aborted) abort();
    request.signal.addEventListener('abort', abort);
    response.then(resolve, reject);
  });
}

it('cancels the request when the screen goes away', async () => {
  const never = deferred();
  fetchStub.on('GET /api/items/:id', (request) => abortable(request, never.promise));
  const view = await renderWithProviders(<ScreenUnderReview />);
  await view.unmount();
  const [request] = fetchStub.requests;
  expect(request?.signal.aborted).toBe(true);
});
```

### Concurrent 401s and the refresh token

Two requests rejected with 401 at once must produce one `POST /api/auth/refresh` (the server rotates
the token: a second refresh with the old one signs the user out). Count
`fetchStub.requests.filter((r) => new URL(r.url).pathname === '/api/auth/refresh')`; hold the
refresh with `deferred()` so both requests are waiting on it. `apps/mobile/src/auth/session.spec.ts`
has the reference tests (`shares one renewal between concurrent rejected requests`).

### Double submit

```tsx
const user = userEvent.setup();
const held = deferred();
fetchStub.on('POST /api/items', () => held.promise);
await user.press(screen.getByRole('button', { name: 'Save' }));
await user.press(screen.getByRole('button', { name: 'Save' }));
expect(fetchStub.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
```

### Timeout and a request that never answers

`jest.useFakeTimers()` in that test only, a handler returning `deferred().promise` (never resolved,
wrapped with `abortable`), advance past the timeout (`DEFAULT_TIMEOUT_MS` in
`apps/mobile/src/api/http.ts`) inside `act`, and expect the error state and a working retry. Restore
real timers at the end.

### Optimistic updates

Seed the cache (`queryClient.setQueryData(itemKeys.list(''), …)`), hold the list refetch with
`deferred()`, run the mutation, release the refetch with the pre-mutation data, and check the
optimistic item is not overwritten by the stale refetch; for rollbacks, fail the mutation
(`failure(422, …)`) and check the exact previous state comes back.

## API patterns

Integration setup, as `apps/api/src/items/items.int.spec.ts` does:

```ts
// DOBERMAN-TEMPORARY: reproduction for F2, deleted by `doberman.mjs clean`.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectRecordAccess } from '../../test/access.js';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { asUser, seedUser, sessionOf, signIn } from '../../test/auth.js';
import { envelopeOf } from '../../test/http.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetDatabase(t.prisma);
});
```

`seedUser(t.prisma, { email, role? })` creates an account (password `TEST_PASSWORD`);
`asUser(t.app, id, role?)` is a bearer header for it; `signIn(t.server, email)` signs in through
the API and returns `{ accessToken, refreshToken, user }`, the session the app would keep;
`envelopeOf(res)` reads `{ data, message, errors? }`. Email: the helpers of `apps/api/test/mailpit.ts`
(`messagesTo`, `readMessage`; `skipWithoutMailpit`); Redis: `apps/api/test/redis.ts`
(`skipWithoutRedis`).

### Object-level access (IDOR)

`expectRecordAccess(t.server, { path, id, owner, other, admin?, method?, body? })` runs the matrix
of one owned record: anonymous 401, another account 404 with exactly the body of a missing record,
the owner (and an admin where allowed) through. For a route it does not fit, call the route for the
other account's record with `asUser(t.app, other.id)` and expect 404 with no data.

### Concurrent requests

`await Promise.all([...])` for double submissions, two renewals with the same refresh token
(`request(t.server).post('/api/auth/refresh').send({ refreshToken })`), a renewal racing a logout or
a password change, two confirmations of one emailed link, or two writers of the same row; assert the
documented outcome (both renewals answer and exactly one session stays live, an idempotent replay,
no duplicate row, the family not revoked by a retry inside the reuse window).
`apps/api/src/auth/auth.int.spec.ts` holds the reference tests (`serializes concurrent renewals of
one token`).

### Validation and output

Send boundary inputs (too long, wrong type, extra fields, negative or huge `limit`) and expect 400
with the envelope and the field in `errors[]`; read the response body for what must never leave the
API (`passwordHash`, token hashes, other accounts' data).

### Outboxes

A change that must notify: run it, then read `t.prisma` for the rows it queued (or did not, when the
transaction rolled back) and Mailpit for the message; a send that fails: the helpers that make
Mailpit refuse (`failRecipients`, `disarmChaos`), or a stand-in for Expo's push service on a local
port, as `FakeExpo` in `apps/api/src/infrastructure/push/push-outbox.int.spec.ts` does (copy it into
the temporary file: never import from another spec).

### Unit level

When the database is not needed, construct the service with fakes as the unit specs do
(`new AccountService(...)` in `apps/api/src/account/account.service.spec.ts`), and drive the timing
with held promises or `vi.useFakeTimers()` (restored at the end).

## Landing patterns

The landing's specs render or read what the build produces (`apps/landing/src/components/pages.spec.ts`)
and check its rules from the files themselves (`apps/landing/src/lib/links.spec.ts` reads the app's
and the API's link paths): a missing translation, a script or inline style in a page, a link path
that disagrees. A reproduction asserts the rule the finding says is broken, with the same helpers.
What only the web server does (headers, the open-in-app page, the link files) is
`e2e/app-links.e2e.ts`'s: name the Playwright test that would show it.

## Validating the fix (optional)

When the fix is small and certain, show the test is the right one: create the sandbox
(`doberman.mjs sandbox --run <runDir>`), install there (`HUSKY=0 pnpm install --frozen-lockfile
--offline`, without `--offline` if the store lacks packages), apply the fix and copy the
reproduction test into the sandbox, run it there: it must pass. Record that in `fixValidated`. The
workspace is never touched; the sandbox is deleted by the clean step. (API integration specs in
the sandbox need `DATABASE_URL` in the environment: the sandbox has no `.env`.)

## What cannot be reproduced here

Native behavior (Keychain/Keystore, permissions dialogs, background execution, push delivery by
Apple and Google), real device timing and memory, iOS-only behavior on a machine without macOS,
real proxies and TLS in front of the API, the production Redis and its failover, and load at scale
(docs/load-testing.md). Mark those UNVERIFIABLE with what would settle them (a Maestro flow, a
device test, a load test, a staging check).
