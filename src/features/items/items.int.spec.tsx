import type { InfiniteData } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { item, page } from '@/test/fixtures';
import { bodyOf, deferred, failure, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { itemKeys, type ItemPage } from './api';
import { ItemDetailScreen } from './ItemDetailScreen';
import { ItemsScreen } from './ItemsScreen';
import { NewItemScreen } from './NewItemScreen';

// UI → TanStack Query hooks → API client (with the session's token) → stubbed API.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
}));

let fetchStub: StubbedFetch;

beforeEach(async () => {
  fetchStub = stubFetch({});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

function listRequests() {
  return fetchStub.requests
    .filter((request) => request.method === 'GET' && new URL(request.url).pathname === '/api/items')
    .map((request) => Object.fromEntries(new URL(request.url).searchParams));
}

describe('ItemsScreen', () => {
  it('loads the first page with the session token, then the next one at the end', async () => {
    const firstPage = deferred();
    fetchStub.on('GET /api/items', (request) => {
      const offset = Number(new URL(request.url).searchParams.get('offset'));
      return offset === 0 ? firstPage.promise : ok(page(offset, 5, 25));
    });
    await renderWithProviders(<ItemsScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading items' })).toBeOnTheScreen();
    firstPage.resolve(ok(page(0, 20, 25)));
    expect(await screen.findByText('Item 0')).toBeOnTheScreen();
    const listRequest = fetchStub.requests.find((request) => request.url.includes('/api/items'));
    expect(listRequest?.headers.get('Authorization')).toBe('Bearer access-test');

    await fireEvent(screen.getByTestId('items-list'), 'onEndReached');
    await waitFor(() => {
      expect(listRequests()).toEqual([
        { limit: '20', offset: '0' },
        { limit: '20', offset: '20' },
      ]);
    });
    // Everything is loaded: no request past the end.
    await fireEvent(screen.getByTestId('items-list'), 'onEndReached');
    expect(listRequests()).toHaveLength(2);
  });

  it('searches once the user stops typing', async () => {
    fetchStub.on('GET /api/items', (request) =>
      new URL(request.url).searchParams.has('q') ? ok(page(0, 0, 0)) : ok(page(0, 3, 3)),
    );
    await renderWithProviders(<ItemsScreen />);
    await screen.findByText('Item 0');
    await userEvent.type(screen.getByLabelText('Search'), 'zzz');
    expect(await screen.findByText('No results')).toBeOnTheScreen();
    expect(listRequests()).toEqual([
      { limit: '20', offset: '0' },
      { limit: '20', offset: '0', q: 'zzz' },
    ]);
  });

  // Found on a device by the Maestro flow: the screen used to swap the list
  // for a spinner while a search loaded, remounting the search field and
  // dropping the keyboard mid-typing.
  it('keeps the search field and the previous results while a search loads', async () => {
    const searched = deferred();
    fetchStub.on('GET /api/items', (request) =>
      new URL(request.url).searchParams.has('q') ? searched.promise : ok(page(0, 3, 3)),
    );
    await renderWithProviders(<ItemsScreen />);
    await screen.findByText('Item 0');
    const field = screen.getByLabelText('Search');
    await userEvent.type(field, 'Item 1');
    await waitFor(() => {
      expect(listRequests()).toHaveLength(2);
    });
    expect(screen.getByLabelText('Search')).toBe(field);
    expect(screen.getByText('Item 0')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading items')).toBeNull();
    searched.resolve(ok({ items: [item(1)], total: 1 }));
    await waitFor(() => {
      expect(screen.queryByText('Item 0')).toBeNull();
    });
    expect(screen.getByText('Item 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Search')).toBe(field);
  });

  it('shows the empty state, and opens the new item sheet', async () => {
    fetchStub.on('GET /api/items', () => ok(page(0, 0, 0)));
    await renderWithProviders(<ItemsScreen />);
    expect(await screen.findByText('No items yet')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'New item' }));
    expect(router.push).toHaveBeenCalledWith('/new-item');
  });

  it('shows an error with a retry that recovers', async () => {
    fetchStub.on('GET /api/items', () => failure(503, 'Maintenance'));
    await renderWithProviders(<ItemsScreen />);
    expect(
      await screen.findByText('Something went wrong on our side. Try again later.'),
    ).toBeOnTheScreen();
    fetchStub.on('GET /api/items', () => ok(page(0, 1, 1)));
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Item 0')).toBeOnTheScreen();
  });

  it('shows an optimistic item as saving, not openable', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData<InfiniteData<ItemPage>>(itemKeys.list(''), {
      pages: [{ items: [{ ...item(1), id: 'optimistic-1', title: 'Pending' }], total: 1 }],
      pageParams: [0],
    });
    fetchStub.on('GET /api/items', () => deferred().promise);
    await renderWithProviders(<ItemsScreen />, { queryClient });
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Pending/ })).toBeNull();
    expect(screen.getByLabelText('Pending, saving')).toBeOnTheScreen();
  });

  it('opens an item', async () => {
    fetchStub.on('GET /api/items', () => ok(page(0, 1, 1)));
    await renderWithProviders(<ItemsScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Item 0' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/items/[id]', params: { id: 'item-0' } });
  });
});

describe('ItemDetailScreen', () => {
  it('shows the item', async () => {
    fetchStub.on('GET /api/items/:id', () => ok(item(3)));
    await renderWithProviders(<ItemDetailScreen id="item-3" />);
    expect(await screen.findByRole('header', { name: 'Item 3' })).toBeOnTheScreen();
    expect(screen.getByText('Description 3')).toBeOnTheScreen();
    expect(screen.getByText(/^Created /)).toBeOnTheScreen();
  });

  it('tells a missing item apart from a failure', async () => {
    fetchStub.on('GET /api/items/:id', () => failure(404, 'Not found'));
    const view = await renderWithProviders(<ItemDetailScreen id="gone" />);
    expect(await screen.findByText('Item not found')).toBeOnTheScreen();

    fetchStub.on('GET /api/items/:id', () => failure(500, 'Boom'));
    await view.unmount();
    await renderWithProviders(<ItemDetailScreen id="broken" />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows an item already in a loaded list at once', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData<InfiniteData<ItemPage>>(itemKeys.list(''), {
      pages: [page(0, 2, 2)],
      pageParams: [0],
    });
    const pending = deferred();
    fetchStub.on('GET /api/items/:id', () => pending.promise);
    await renderWithProviders(<ItemDetailScreen id="item-1" />, { queryClient });
    expect(screen.getByRole('header', { name: 'Item 1' })).toBeOnTheScreen();
    pending.resolve(ok(item(1)));
  });
});

describe('NewItemScreen', () => {
  async function submit(title: string, description = '') {
    const user = userEvent.setup();
    if (title) await user.type(screen.getByLabelText('Title'), title);
    if (description) await user.type(screen.getByLabelText('Description'), description);
    await user.press(screen.getByRole('button', { name: 'Create' }));
  }

  function posts() {
    return fetchStub.requests.filter(
      (request) => request.method === 'POST' && request.url.endsWith('/api/items'),
    );
  }

  function listed(queryClient: ReturnType<typeof testQueryClient>) {
    return queryClient.getQueryData<InfiniteData<ItemPage>>(itemKeys.list(''));
  }

  /** A loaded list, then a create the server holds until the test answers it. */
  async function createHeld() {
    const queryClient = testQueryClient();
    queryClient.setQueryData<InfiniteData<ItemPage>>(itemKeys.list(''), {
      pages: [page(0, 1, 1)],
      pageParams: [0],
    });
    const created = deferred();
    fetchStub.on('POST /api/items', () => created.promise);
    fetchStub.on('GET /api/items', () => ok(page(0, 2, 2)));
    const onCreated = jest.fn();
    const view = await renderWithProviders(<NewItemScreen onCreated={onCreated} />, {
      queryClient,
    });
    await submit('Groceries');
    await waitFor(() => {
      expect(listed(queryClient)?.pages[0]?.items[0]?.id).toMatch(/^optimistic-/);
    });
    return { queryClient, created, onCreated, view };
  }

  it('validates before sending anything', async () => {
    await renderWithProviders(<NewItemScreen onCreated={jest.fn()} />);
    await submit('');
    expect(await screen.findByText('Enter a title')).toBeOnTheScreen();
    expect(posts()).toHaveLength(0);
  });

  it('creates the item, optimistically listed, and closes the sheet', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData<InfiniteData<ItemPage>>(itemKeys.list(''), {
      pages: [page(0, 1, 1)],
      pageParams: [0],
    });
    const created = deferred();
    fetchStub.on('POST /api/items', () => created.promise);
    fetchStub.on('GET /api/items', () => ok(page(0, 2, 2)));
    const onCreated = jest.fn();
    await renderWithProviders(<NewItemScreen onCreated={onCreated} />, { queryClient });
    await submit('Groceries', 'Milk');

    await waitFor(() => {
      const first = listed(queryClient)?.pages[0];
      expect(first?.items[0]).toMatchObject({ title: 'Groceries', description: 'Milk' });
      expect(first?.items[0]?.id).toMatch(/^optimistic-/);
    });
    expect(await bodyOf(posts()[0]!)).toEqual({ title: 'Groceries', description: 'Milk' });

    created.resolve(ok({ ...item(9), title: 'Groceries' }, 201));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    // The optimistic row is now the server's item, until the list is refetched.
    expect(listed(queryClient)?.pages[0]?.items.map(({ id }) => id)).toEqual(['item-9', 'item-0']);
    expect(queryClient.getQueryData(itemKeys.detail('item-9'))).toMatchObject({
      title: 'Groceries',
    });
  });

  it('rolls the optimistic item back and shows the field error the server sent', async () => {
    const queryClient = testQueryClient();
    const before: InfiniteData<ItemPage> = { pages: [page(0, 1, 1)], pageParams: [0] };
    queryClient.setQueryData(itemKeys.list(''), before);
    fetchStub.on('POST /api/items', () =>
      failure(400, 'Invalid body', [{ path: 'title', message: 'Already used' }]),
    );
    fetchStub.on('GET /api/items', () => ok(page(0, 1, 1)));
    const onCreated = jest.fn();
    await renderWithProviders(<NewItemScreen onCreated={onCreated} />, { queryClient });
    await submit('Duplicate');
    expect(await screen.findByText('Already used')).toBeOnTheScreen();
    expect(listed(queryClient)?.pages[0]).toEqual(before.pages[0]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('shows other failures as a message', async () => {
    fetchStub.on('POST /api/items', () => Promise.reject(new TypeError('Network request failed')));
    await renderWithProviders(<NewItemScreen onCreated={jest.fn()} />);
    await submit('Offline item');
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });

  // The sheet can be swiped away (or closed with Android's back button) while
  // the create is on its way: when it finishes, nothing moves the user.
  it('closes nothing when the sheet was closed before the create finished', async () => {
    const { queryClient, created, onCreated, view } = await createHeld();
    await view.unmount();
    created.resolve(ok({ ...item(9), title: 'Groceries' }, 201));
    await waitFor(() => {
      expect(queryClient.getQueryData(itemKeys.detail('item-9'))).toBeDefined();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  // A sign-out clears the cache while the create is on its way: whatever the
  // create does when it settles must not reach the next user's data.
  describe('when the session ended during the create', () => {
    it('does not bring the previous list back when the create fails', async () => {
      const { queryClient, created } = await createHeld();
      queryClient.clear(); // what the sign-out does (src/app/_layout.tsx)
      created.resolve(failure(503, 'Maintenance'));
      expect(await screen.findByRole('alert')).toBeOnTheScreen();
      expect(listed(queryClient)).toBeUndefined();
    });

    it("leaves the next user's list as it is when the create fails", async () => {
      const { queryClient, created } = await createHeld();
      queryClient.clear();
      const nextUser: InfiniteData<ItemPage> = { pages: [page(100, 1, 1)], pageParams: [0] };
      queryClient.setQueryData(itemKeys.list(''), nextUser);
      created.resolve(failure(503, 'Maintenance'));
      expect(await screen.findByRole('alert')).toBeOnTheScreen();
      expect(listed(queryClient)).toEqual(nextUser);
    });

    it('writes nothing when the create succeeds', async () => {
      const { queryClient, created } = await createHeld();
      queryClient.clear();
      created.resolve(ok({ ...item(9), title: 'Groceries' }, 201));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
      });
      expect(queryClient.getQueryData(itemKeys.detail('item-9'))).toBeUndefined();
      expect(listed(queryClient)).toBeUndefined();
    });
  });

  it('rolls back only its own item when the list was refetched meanwhile', async () => {
    const { queryClient, created } = await createHeld();
    const refetched: InfiniteData<ItemPage> = { pages: [page(0, 3, 3)], pageParams: [0] };
    queryClient.setQueryData(itemKeys.list(''), refetched);
    created.resolve(failure(503, 'Maintenance'));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(listed(queryClient)).toEqual(refetched);
  });
});

// The generated types describe what the server promises, not what reaches
// the device: a response that breaks the contract is an error state, never a
// crash or a list of half-empty rows.
describe('responses that break the contract', () => {
  it('shows an error for an item whose date is not a date', async () => {
    fetchStub.on('GET /api/items/:id', () => ok({ ...item(3), createdAt: 'yesterday' }));
    await renderWithProviders(<ItemDetailScreen id="item-3" />);
    expect(
      await screen.findByText('Something went wrong on our side. Try again later.'),
    ).toBeOnTheScreen();
  });

  it('shows an error for a page of items without titles', async () => {
    fetchStub.on('GET /api/items', () =>
      ok({ items: [{ id: 'item-0', createdAt: item(0).createdAt }], total: 1 }),
    );
    await renderWithProviders(<ItemsScreen />);
    expect(
      await screen.findByText('Something went wrong on our side. Try again later.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('item-item-0')).toBeNull();
  });

  it('shows an error for a created item the app cannot read', async () => {
    const queryClient = testQueryClient();
    fetchStub.on('POST /api/items', () => ok({ id: 'item-9' }, 201));
    fetchStub.on('GET /api/items', () => ok(page(0, 2, 2)));
    await renderWithProviders(<NewItemScreen onCreated={jest.fn()} />, { queryClient });
    await userEvent.type(screen.getByLabelText('Title'), 'Groceries');
    await userEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
    expect(queryClient.getQueryData(itemKeys.detail('item-9'))).toBeUndefined();
  });
});
