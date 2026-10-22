import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';

import { useSessionStore } from '@/auth/session';
import { itemKeys } from '@/features/items/api';
import { errorReporter } from '@/lib/observability';
import { queryClient } from '@/lib/query/queryClient';
import { persistentStorage, secureStorage, STORAGE_KEYS } from '@/lib/storage';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { account, item, page, session as sessionFixture, tokens, user } from '@/test/fixtures';
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
  useSessionStore.setState({ status: 'restoring', endedBy: null });
  queryClient.clear();
  fetchStub = stubFetch({
    'GET /api/items': () => ok(page(0, 2, 2)),
    'GET /api/items/:id': () => ok(item(1)),
    'GET /api/users/me': () => ok(account),
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
  fetchStub.on('POST /api/auth/refresh', () => ok(tokens('1')));
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
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
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
    useSessionStore.setState({ status: 'restoring', endedBy: null });
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
