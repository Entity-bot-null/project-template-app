import { session, useSessionStore } from '@/auth/session';

import { session as sessionFixture, user } from './fixtures';
import { noContent, ok, type StubbedFetch } from './http';

/**
 * Signs the app's session in through the stubbed API (integration tests of
 * signed-in screens), as the member of the fixtures or as `as`.
 */
export async function signInForTest(
  fetchStub: StubbedFetch,
  as: Partial<typeof user> = {},
): Promise<void> {
  fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('test', { ...user, ...as })));
  await session.signIn({ email: user.email, password: 'password' });
}

/** Ends the session so the next test starts signed out, with nothing in memory. */
export async function endTestSession(fetchStub: StubbedFetch): Promise<void> {
  fetchStub.on('POST /api/auth/logout', () => noContent());
  await session.signOut();
  useSessionStore.setState({ status: 'signedOut', endedBy: null });
}
