import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { redirectSystemPath } from '@/app/+native-intent';
import { linkTokens } from '@/auth/linkTokens';
import { useSessionStore } from '@/auth/session';
import { capabilitiesKey } from '@/features/auth/api';
import { itemKeys } from '@/features/items/api';
import { useUpgradeStore } from '@/features/update/upgrade';
import { LINK_TOKEN_SCREENS } from '@/lib/links';
import { errorReporter } from '@/lib/observability';
import { queryClient } from '@/lib/query/queryClient';
import { persistentStorage, secureStorage, STORAGE_KEYS } from '@/lib/storage';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import {
  account,
  capabilities,
  item,
  page,
  session as sessionFixture,
  user,
} from '@/test/fixtures';
import { deferred, failure, noContent, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderApp } from '@/test/router';
import { endTestSession } from '@/test/session';

// The real routes of src/app, rendered by Expo Router: which flow is
// available in which state, and how the app moves between them.

// The first render of the whole app loads and transforms every route module
// (seconds under coverage instrumentation, on a busy machine more); the
// following ones take a few hundred milliseconds.
jest.setTimeout(20_000);

let fetchStub: StubbedFetch;

beforeEach(() => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  useSessionStore.setState({ status: 'restoring', endedBy: null, user: null });
  useUpgradeStore.setState({ required: false });
  queryClient.clear();
  fetchStub = stubFetch({
    'GET /api/items': () => ok(page(0, 2, 2)),
    'GET /api/items/:id': () => ok(item(1)),
    'GET /api/users/me': () => ok(account),
    'GET /api/auth/capabilities': () => ok(capabilities),
    'POST /api/auth/logout': () => noContent(),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

/** A session stored by an earlier launch of this installation. */
async function storedSession() {
  await persistentStorage.setItem(STORAGE_KEYS.installation, 'installed');
  await secureStorage.setItem(STORAGE_KEYS.refreshToken, 'refresh-0');
  fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('1')));
}

describe('navigation', () => {
  it('walks a new user through onboarding, then sign-in, then the app', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('1')));
    await renderApp('/');
    expect(await screen.findByTestId('onboarding-screen')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'member@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Item 0')).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-in-screen')).toBeNull();
  });

  it('restores a stored session straight into the app', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/');
    expect(await screen.findByText('Item 0')).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-in-screen')).toBeNull();
  });

  it('opens a deep link to an item when signed in', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/items/item-1');
    expect(await screen.findByTestId('item-detail-screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Item 1' })).toBeOnTheScreen();
  });

  // A link that starts the app (a notification, a link in another app) builds
  // the navigation from its URL alone: without an anchor the item would be the
  // only screen, with no way back, and Android's back button would close the app.
  it('puts the list below an item opened by a link, to go back to', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/items/item-1');
    expect(await screen.findByTestId('item-detail-screen')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(true);
    await act(() => {
      router.back();
    });
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
  });

  it('keeps a signed-out user out of protected screens', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await renderApp('/items/item-1');
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('item-detail-screen')).toBeNull();
    expect(fetchStub.requests.some((request) => request.url.includes('/api/items'))).toBe(false);
  });

  it('offers only the update screen once the API refuses this app version (426)', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    fetchStub.on('GET /api/items', () =>
      failure(426, 'This version of the app is no longer supported'),
    );
    await renderApp('/');
    expect(await screen.findByTestId('update-required-screen')).toBeOnTheScreen();
    expect(screen.getByText('Update required')).toBeOnTheScreen();
    // A link into the app cannot get past it either.
    await renderApp('/settings');
    expect(await screen.findByTestId('update-required-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings-screen')).toBeNull();
  });

  it('returns to sign-in when the session ends, with nothing of it left', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/');
    await screen.findByText('Item 0');
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
    const clearDisk = jest.spyOn(ExpoImage, 'clearDiskCache').mockResolvedValue(true);
    const clearMemory = jest.spyOn(ExpoImage, 'clearMemoryCache').mockResolvedValue(true);

    await act(async () => {
      await endTestSession(fetchStub);
    });
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    // Nothing of the session is left: only what the sign-in screen loads
    // itself, before anyone signs in (what the server offers).
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([capabilitiesKey]);
    expect(clearDisk).toHaveBeenCalled();
    expect(clearMemory).toHaveBeenCalled();
  });

  it('keeps nothing of a create the server refused because the session ended', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/');
    expect(await screen.findByText('Item 0')).toBeOnTheScreen();
    await act(() => {
      router.push('/new-item');
    });
    const person = userEvent.setup();
    await person.type(await screen.findByLabelText('Title'), 'Groceries');
    // The server ended the session meanwhile (revoked, password changed).
    fetchStub.on('POST /api/items', () => failure(401, 'Session revoked'));
    fetchStub.on('POST /api/auth/refresh', () => failure(401, 'Refresh token revoked'));
    await person.press(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(0);
    });
    expect(queryClient.getQueryData(itemKeys.list(''))).toBeUndefined();

    // The next user signs in on the same device; their list is on its way.
    const listOfNextUser = deferred();
    fetchStub.on('GET /api/items', () => listOfNextUser.promise);
    fetchStub.on('POST /api/auth/sign-in', () =>
      ok({ ...sessionFixture('b'), user: { ...user, id: 'user-b', email: 'b@example.com' } }),
    );
    await person.type(screen.getByLabelText('Email'), 'b@example.com');
    await person.type(screen.getByLabelText('Password'), 'password');
    await person.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
    expect(screen.queryByText('Item 0')).toBeNull();
    await act(() => {
      listOfNextUser.resolve(ok(page(100, 1, 1)));
    });
    expect(await screen.findByText('Item 100')).toBeOnTheScreen();
    expect(screen.queryByText('Item 0')).toBeNull();
  });

  it('signs out even when the image cache cannot be cleared, and reports it', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/');
    await screen.findByText('Item 0');
    const failure = new Error('disk cache busy');
    jest.spyOn(ExpoImage, 'clearDiskCache').mockRejectedValue(failure);
    jest.spyOn(ExpoImage, 'clearMemoryCache').mockResolvedValue(true);
    const reported = jest.spyOn(errorReporter(), 'capture');

    await act(async () => {
      await endTestSession(fetchStub);
    });
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(reported).toHaveBeenCalledWith(failure, expect.anything());
  });

  it('sends unknown routes to sign-in when signed out and home when signed in', async () => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    const signedOut = await renderApp('/does/not/exist');
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    await signedOut.unmount();

    await storedSession();
    useSessionStore.setState({ status: 'restoring', endedBy: null, user: null });
    await renderApp('/does/not/exist');
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
  });
});

describe('the new item sheet', () => {
  /** Signed in, on the list, with the sheet open and a title typed. */
  async function openSheet() {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
    await storedSession();
    await renderApp('/');
    await screen.findByText('Item 0');
    await act(() => {
      router.push('/new-item');
    });
    const person = userEvent.setup();
    await person.type(await screen.findByLabelText('Title'), 'Groceries');
    return person;
  }

  /** Creates the item with the server's answer held until `created` is resolved. */
  async function createHeld(person: ReturnType<typeof userEvent.setup>) {
    const created = deferred();
    fetchStub.on('POST /api/items', () => created.promise);
    await person.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(fetchStub.requests.some((request) => request.method === 'POST')).toBe(true);
    });
    return created;
  }

  async function settle(created: ReturnType<typeof deferred>) {
    await act(() => {
      created.resolve(ok({ ...item(9), title: 'Groceries' }, 201));
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(0);
    });
  }

  it('closes once the item is created', async () => {
    const person = await openSheet();
    fetchStub.on('POST /api/items', () => ok({ ...item(9), title: 'Groceries' }, 201));
    await person.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.queryByTestId('new-item-screen')).toBeNull();
    });
    expect(screen.getByTestId('items-list')).toBeOnTheScreen();
  });

  it('moves nobody when it was closed before the create finished', async () => {
    const person = await openSheet();
    const created = await createHeld(person);
    // Swiped away while saving; then the user opens an item.
    await act(() => {
      router.back();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('new-item-screen')).toBeNull();
    });
    await act(() => {
      router.push('/items/item-1');
    });
    expect(await screen.findByTestId('item-detail-screen')).toBeOnTheScreen();

    await settle(created);
    expect(screen.getByTestId('item-detail-screen')).toBeOnTheScreen();
  });

  it('closes itself, not the screen opened over it while it saved', async () => {
    const person = await openSheet();
    const created = await createHeld(person);
    // A notification opens an item over the sheet while it saves.
    await act(() => {
      router.push('/items/item-1');
    });
    expect(await screen.findByTestId('item-detail-screen')).toBeOnTheScreen();

    await settle(created);
    expect(screen.getByTestId('item-detail-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('new-item-screen')).toBeNull();
  });
});

describe('accounts, emailed links and administration', () => {
  const TOKEN = 'Nv8_-'.repeat(9).slice(0, 43);

  beforeEach(() => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, onboardingCompleted: true });
  });

  afterEach(() => {
    for (const screenName of LINK_TOKEN_SCREENS) linkTokens.take(screenName);
  });

  it('leads from sign-in to sign-up and to password recovery', async () => {
    await renderApp('/sign-in');
    await userEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByTestId('sign-up-screen')).toBeOnTheScreen();
    await act(() => {
      router.back();
    });
    await userEvent.press(await screen.findByRole('button', { name: 'Forgot your password?' }));
    expect(await screen.findByTestId('forgot-password-screen')).toBeOnTheScreen();
  });

  it('opens an emailed link signed out, and the confirmed sign-up leads into the app', async () => {
    // As src/app/+native-intent.tsx leaves it: the token kept, the path without it.
    expect(
      redirectSystemPath({
        path: `https://app.example.com/app/confirm-sign-up#token=${TOKEN}`,
        initial: true,
      }),
    ).toBe('/confirm-sign-up');
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => ok(sessionFixture('new')));
    await renderApp('/confirm-sign-up');
    const person = userEvent.setup();
    await person.type(await screen.findByLabelText('Password'), 'the password chosen');
    await person.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByTestId('confirm-sign-up-done')).toBeOnTheScreen();
    expect(useSessionStore.getState().status).toBe('signedIn');
    await person.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
  });

  it('opens an emailed link over the app when signed in', async () => {
    await storedSession();
    linkTokens.keep('confirm-email-change', TOKEN);
    await renderApp('/confirm-email-change');
    expect(await screen.findByTestId('confirm-email-change-screen')).toBeOnTheScreen();
  });

  it.each([
    ['reset-password', 'reset-password-screen'],
    ['accept-invitation', 'accept-invitation-screen'],
    ['revert-email-change', 'revert-email-change-screen'],
  ] as const)('opens the %s link’s screen', async (screenName, testID) => {
    linkTokens.keep(screenName, TOKEN);
    await renderApp(`/${screenName}`);
    expect(await screen.findByTestId(testID)).toBeOnTheScreen();
  });

  it('lets no link past the update screen', async () => {
    await storedSession();
    fetchStub.on('GET /api/items', () => failure(426, 'Update the app'));
    await renderApp('/');
    expect(await screen.findByTestId('update-required-screen')).toBeOnTheScreen();
    linkTokens.keep('reset-password', TOKEN);
    await renderApp('/reset-password');
    expect(await screen.findByTestId('update-required-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('reset-password-screen')).toBeNull();
  });

  // The administration is reached from Settings, never by a link
  // (src/lib/links.ts accepts none of its paths).
  it('keeps a member out of the administration', async () => {
    await storedSession();
    fetchStub.on('GET /api/users', () => ok({ items: [], total: 0 }));
    await renderApp('/');
    await screen.findByTestId('items-list');
    await act(() => {
      router.push('/admin/users');
    });
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
    expect(screen.queryByTestId('users-list')).toBeNull();
    expect(fetchStub.requests.some((request) => request.url.includes('/api/users?'))).toBe(false);
  });

  it('opens the administration to an admin, and closes it when the role is gone', async () => {
    await storedSession();
    const admin = { ...user, role: 'admin' as const };
    fetchStub.on('POST /api/auth/refresh', () => ok(sessionFixture('1', admin)));
    fetchStub.on('GET /api/users', () => ok({ items: [{ ...account, role: 'admin' }], total: 1 }));
    await renderApp('/');
    await screen.findByTestId('items-list');
    await act(() => {
      router.push('/admin/users');
    });
    expect(await screen.findByTestId('users-list')).toBeOnTheScreen();
    fetchStub.on('GET /api/admin/invitations', () => ok({ items: [], total: 0 }));
    await act(() => {
      router.push('/admin/invitations');
    });
    expect(await screen.findByTestId('invitations-list')).toBeOnTheScreen();

    // A renewal tells the role changed on the server.
    await act(() => {
      useSessionStore.setState({ user: { ...admin, role: 'member' } });
    });
    expect(await screen.findByTestId('items-list')).toBeOnTheScreen();
    expect(screen.queryByTestId('users-list')).toBeNull();
  });

  it('opens the account screens from settings, and a deleted account leaves for sign-in', async () => {
    await storedSession();
    fetchStub.on('POST /api/account/password', () => ok(sessionFixture('2')));
    fetchStub.on('POST /api/account/email', () => new Response(null, { status: 202 }));
    fetchStub.on('POST /api/account/deletion', () => noContent());
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons!.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await renderApp('/settings');
    const typing = userEvent.setup();

    await typing.press(await screen.findByRole('button', { name: 'Change password' }));
    await typing.type(await screen.findByLabelText('Current password'), 'the password');
    await typing.type(screen.getByLabelText('New password'), 'a brand new passphrase');
    await typing.type(screen.getByLabelText('Repeat the new password'), 'a brand new passphrase');
    await typing.press(screen.getByRole('button', { name: 'Change password' }));
    await typing.press(await screen.findByRole('button', { name: 'Done' }));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();

    await typing.press(await screen.findByRole('button', { name: 'Change email' }));
    await typing.type(await screen.findByLabelText('New email'), 'new@example.com');
    await typing.type(screen.getByLabelText('Current password'), 'a brand new passphrase');
    await typing.press(screen.getByRole('button', { name: 'Send the link' }));
    await typing.press(await screen.findByRole('button', { name: 'Done' }));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();

    await userEvent.press(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByTestId('delete-account-screen')).toBeOnTheScreen();
    const person = userEvent.setup();
    await person.type(screen.getByLabelText('Password'), 'the password');
    await person.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(useSessionStore.getState()).toEqual({
      status: 'signedOut',
      endedBy: 'user',
      user: null,
    });
  });
});
