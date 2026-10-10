# Reproducing a suspected bug

A suspicion becomes a finding when a test shows it. This guide is for this template's test stack
(Jest + React Native Testing Library 14 + the helpers of `src/test/`, [docs/TESTING.md](../../../../docs/TESTING.md)).

## Contents

- [Rules](#rules)
- [The file](#the-file)
- [Running and classifying](#running-and-classifying)
- [Patterns](#patterns)
- [Validating the fix (optional)](#validating-the-fix-optional)
- [What cannot be reproduced here](#what-cannot-be-reproduced-here)

## Rules

1. The test asserts the **correct** behavior: it fails while the bug exists and passes once it is
   fixed. A test that asserts the bug ("expect the stale value") proves nothing about a fix.
2. Realistic, through the real code: stub the network (`stubFetch`), not the unit under review.
   Render the real screen or hook with the real query client, session and HTTP pipeline.
3. Model time and order explicitly: held responses (`deferred()`), responses released out of order,
   aborts, a response that never comes. An instant stub hides races; a stub that ignores the abort
   signal hides cancellation bugs (see [abort-aware responses](#abort-aware-responses)).
4. Never edit an existing file (test, helper or production code) to reproduce. Everything the test
   needs goes inside the temporary file.
5. One scenario per test, named after the expected behavior.

## The file

- Name: `<subject>.doberman.spec.tsx` (or `.ts`), **inside `src/`** next to the code under test:
  Jest only collects `src/**/*.spec.ts(x)`, and the `@/` aliases resolve there.
- First line, exactly this marker (the clean step deletes only marked files):

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

```sh
pnpm exec jest --coverage=false --runTestsByPath <file> > "<logDir>/repro-<id>.log" 2>&1; echo "DOBERMAN_EXIT=$?"
```

Read the log, then classify:

| Status         | When                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| REPRODUCED     | the test fails **on the assertion that encodes the expected behavior**, with the wrong value the bug predicts (quote it as evidence)     |
| NOT REPRODUCED | the test passes: the code handles the scenario. Drop the finding, or keep it UNVERIFIED only if the test could not model the real timing |
| UNVERIFIABLE   | the scenario cannot be expressed here (native behavior, real device timing, server-side logic not in this repository): say what would    |

A failure for any other reason (import error, type error, a helper misused, a timeout in setup) is
not a reproduction: fix the test and run it again. Before calling something REPRODUCED, read the
failing assertion and check that it fails for the reason the finding claims.

Delete the file once its result is recorded (or leave it for the clean step, which deletes every
marked file).

## Patterns

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
refresh with `deferred()` so both requests are waiting on it. `src/auth/session.spec.ts` has the
reference tests (`shares one renewal between concurrent rejected requests`).

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
wrapped with `abortable`), advance past the timeout (`DEFAULT_TIMEOUT_MS` in `src/api/http.ts`)
inside `act`, and expect the error state and a working retry. Restore real timers at the end.

### Optimistic updates

Seed the cache (`queryClient.setQueryData(itemKeys.list(''), …)`), hold the list refetch with
`deferred()`, run the mutation, release the refetch with the pre-mutation data, and check the
optimistic item is not overwritten by the stale refetch; for rollbacks, fail the mutation
(`failure(422, …)`) and check the exact previous state comes back.

## Validating the fix (optional)

When the fix is small and certain, show the test is the right one: create the sandbox
(`doberman.mjs sandbox --run <runDir>`), install there (`HUSKY=0 pnpm install --frozen-lockfile
--offline`, without `--offline` if the store lacks packages), apply the fix and copy the
reproduction test into the sandbox, run it there: it must pass. Record that in `fixValidated`. The
workspace is never touched; the sandbox is deleted by the clean step.

## What cannot be reproduced here

Native behavior (Keychain/Keystore, permissions dialogs, background execution, push delivery),
real device timing and memory, iOS-only behavior on a machine without macOS, and server-side rules
(the backend is not in this repository: the contract is). Mark those UNVERIFIABLE with what would
settle them (a Maestro flow, a device test, the backend's test).
