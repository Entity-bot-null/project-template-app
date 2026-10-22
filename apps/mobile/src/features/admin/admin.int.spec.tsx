import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { components } from '@/api/client';
import { account, capabilities } from '@/test/fixtures';
import {
  bodyOf,
  deferred,
  failure,
  noContent,
  ok,
  stubFetch,
  type StubbedFetch,
} from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { InvitationsScreen } from './InvitationsScreen';
import { UsersScreen } from './UsersScreen';

// Administration: UI → API client → (stubbed) API. Who reaches these
// screens is the navigation's business (navigation.int.spec.tsx).

type Invitation = components['schemas']['Invitation'];

function userAt(index: number): components['schemas']['User'] {
  return {
    ...account,
    id: `user-${index}`,
    email: `person${index}@example.com`,
    name: `Person ${index}`,
    role: index === 0 ? 'admin' : 'member',
  };
}

function users(from: number, count: number, total: number) {
  return { items: Array.from({ length: count }, (_, offset) => userAt(from + offset)), total };
}

function invitation(index: number, overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: `invitation-${index}`,
    email: `invited${index}@example.com`,
    role: 'member',
    invitedBy: { id: 'user-0', name: 'Person 0' },
    createdAt: '2026-01-01T09:00:00.000Z',
    expiresAt: '2026-01-08T09:00:00.000Z',
    ...overrides,
  };
}

let fetchStub: StubbedFetch;

beforeEach(async () => {
  fetchStub = stubFetch({
    'GET /api/auth/capabilities': () => ok(capabilities),
    'POST /api/auth/logout': () => noContent(),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await signInForTest(fetchStub, { role: 'admin' });
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

function sent(method: string, path: string) {
  return fetchStub.requests.filter(
    (request) => request.method === method && new URL(request.url).pathname === path,
  );
}

describe('UsersScreen', () => {
  it('lists every account, a page at a time', async () => {
    const nextPage = deferred();
    fetchStub.on('GET /api/users', (request) =>
      new URL(request.url).searchParams.get('offset') === '0'
        ? ok(users(0, 20, 25))
        : nextPage.promise,
    );
    await renderWithProviders(<UsersScreen />);
    expect(await screen.findByText('Person 0')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/^Person 0, person0@example\.com, Administrator, joined /),
    ).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('users-list'), 'onEndReached');
    expect(
      await screen.findByRole('progressbar', { name: 'Loading more users' }),
    ).toBeOnTheScreen();
    nextPage.resolve(ok(users(20, 5, 25)));
    await waitFor(() => {
      expect(screen.queryByRole('progressbar', { name: 'Loading more users' })).toBeNull();
    });
    // All 25 loaded: the end of the list asks for no more.
    await fireEvent(screen.getByTestId('users-list'), 'onEndReached');
    const offsets = sent('GET', '/api/users').map((request) =>
      new URL(request.url).searchParams.get('offset'),
    );
    expect(offsets).toEqual(['0', '20']);
  });

  it('shows the failure of the first load with a retry, and of the next page at the end', async () => {
    const answers = [
      failure(503, 'Maintenance'),
      ok(users(0, 20, 25)),
      failure(503, 'Maintenance'),
    ];
    fetchStub.on('GET /api/users', () => answers.shift()!);
    await renderWithProviders(<UsersScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Person 0')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('users-list'), 'onEndReached');
    expect(await screen.findByText('Could not load more users')).toBeOnTheScreen();
    expect(screen.getByText('Person 0')).toBeOnTheScreen();
  });

  it('refreshes when pulled, keeping the rows when that fails, and retries', async () => {
    const answers = [
      ok(users(0, 20, 25)),
      failure(503, 'Maintenance'),
      ok(users(0, 20, 25)),
      failure(503, 'Maintenance'),
      ok(users(20, 5, 25)),
    ];
    fetchStub.on('GET /api/users', () => answers.shift()!);
    await renderWithProviders(<UsersScreen />);
    expect(await screen.findByText('Person 0')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('users-list'), 'refresh');
    expect(await screen.findByText('Could not refresh the users')).toBeOnTheScreen();
    expect(screen.getByText('Person 0')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByText('Could not refresh the users')).toBeNull();
    });

    await fireEvent(screen.getByTestId('users-list'), 'onEndReached');
    expect(await screen.findByText('Could not load more users')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByText('Could not load more users')).toBeNull();
    });
    expect(sent('GET', '/api/users')).toHaveLength(5);
  });

  it('has an empty state', async () => {
    fetchStub.on('GET /api/users', () => ok(users(0, 0, 0)));
    await renderWithProviders(<UsersScreen />);
    expect(await screen.findByText('No users')).toBeOnTheScreen();
  });
});

describe('InvitationsScreen', () => {
  async function invite(email: string, role?: 'Administrator') {
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('Email'), email);
    if (role) await typing.press(screen.getByRole('radio', { name: role }));
    await typing.press(screen.getByRole('button', { name: 'Send invitation' }));
  }

  it('invites an address with a role, then lists it', async () => {
    const listed = [
      ok({ items: [], total: 0 }),
      ok({ items: [invitation(1, { role: 'admin' })], total: 1 }),
    ];
    fetchStub.on('GET /api/admin/invitations', () => listed.shift()!);
    fetchStub.on('POST /api/admin/invitations', () => ok(invitation(1, { role: 'admin' }), 201));
    await renderWithProviders(<InvitationsScreen />);
    expect(await screen.findByText('No pending invitations')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Member' })).toBeChecked();
    await invite(' Invited1@Example.com', 'Administrator');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invitation sent to invited1@example.com.',
    );
    expect(await bodyOf(sent('POST', '/api/admin/invitations')[0]!)).toEqual({
      email: 'invited1@example.com',
      role: 'admin',
    });
    expect(
      await screen.findByText(/^Administrator · invited by Person 0 · expires \S/),
    ).toBeOnTheScreen();
    // The form is ready for the next one.
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('');
    expect(screen.getByRole('radio', { name: 'Member' })).toBeChecked();
  });

  it.each([
    [failure(409, 'An account with this address exists'), 'This address has an account already.'],
    [failure(429, 'This address got a message moments ago'), /got a message moments ago/],
    [
      failure(400, 'email: invalid', [{ path: 'email', message: 'Invalid email address' }]),
      'Invalid email address',
    ],
    [failure(503, 'Email is not configured'), /on our side/],
  ])('answers a refusal in the user’s words (%#)', async (answer, shown) => {
    fetchStub.on('GET /api/admin/invitations', () => ok({ items: [], total: 0 }));
    fetchStub.on('POST /api/admin/invitations', () => answer);
    await renderWithProviders(<InvitationsScreen />);
    await screen.findByText('No pending invitations');
    await invite('someone@example.com');
    expect(await screen.findByText(shown)).toBeOnTheScreen();
  });

  it('checks the address before sending anything', async () => {
    fetchStub.on('GET /api/admin/invitations', () => ok({ items: [], total: 0 }));
    await renderWithProviders(<InvitationsScreen />);
    await screen.findByText('No pending invitations');
    await invite('nope');
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(sent('POST', '/api/admin/invitations')).toHaveLength(0);
  });

  it('offers no invitations on a server that sends no email, still listing the pending ones', async () => {
    fetchStub.on('GET /api/auth/capabilities', () => ok({ ...capabilities, invitations: false }));
    fetchStub.on('GET /api/admin/invitations', () =>
      ok({ items: [invitation(2, { invitedBy: null, expiresAt: null })], total: 1 }),
    );
    await renderWithProviders(<InvitationsScreen />);
    expect(await screen.findByText(/cannot send invitations/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull();
    expect(screen.getByText('invited2@example.com')).toBeOnTheScreen();
    expect(screen.getByText('Member')).toBeOnTheScreen();
  });

  describe('revoking', () => {
    function confirmWith(choice: 'Revoke' | 'Cancel') {
      return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
        buttons!.find((button) => button.text === choice)?.onPress?.();
      });
    }

    it('revokes after a confirmation, then the list drops it', async () => {
      confirmWith('Revoke');
      const listed = [ok({ items: [invitation(3)], total: 1 }), ok({ items: [], total: 0 })];
      fetchStub.on('GET /api/admin/invitations', () => listed.shift()!);
      fetchStub.on('DELETE /api/admin/invitations/:id', () => noContent());
      await renderWithProviders(<InvitationsScreen />);
      await userEvent.press(
        await screen.findByRole('button', {
          name: 'Revoke the invitation of invited3@example.com',
        }),
      );
      expect(await screen.findByText('No pending invitations')).toBeOnTheScreen();
      expect(sent('DELETE', '/api/admin/invitations/invitation-3')).toHaveLength(1);
    });

    it('sends nothing when cancelled', async () => {
      confirmWith('Cancel');
      fetchStub.on('GET /api/admin/invitations', () => ok({ items: [invitation(3)], total: 1 }));
      await renderWithProviders(<InvitationsScreen />);
      await userEvent.press(
        await screen.findByRole('button', {
          name: 'Revoke the invitation of invited3@example.com',
        }),
      );
      expect(sent('DELETE', '/api/admin/invitations/invitation-3')).toHaveLength(0);
    });

    it('says a failure on the row, but not an invitation already gone', async () => {
      confirmWith('Revoke');
      fetchStub.on('GET /api/admin/invitations', () =>
        ok({ items: [invitation(3), invitation(4)], total: 2 }),
      );
      fetchStub.on('DELETE /api/admin/invitations/:id', (request) =>
        request.url.endsWith('invitation-3')
          ? failure(404, 'Not found')
          : failure(503, 'Maintenance'),
      );
      await renderWithProviders(<InvitationsScreen />);
      await userEvent.press(
        await screen.findByRole('button', {
          name: 'Revoke the invitation of invited3@example.com',
        }),
      );
      await waitFor(() => {
        expect(sent('DELETE', '/api/admin/invitations/invitation-3')).toHaveLength(1);
      });
      expect(screen.queryByRole('alert')).toBeNull();
      await userEvent.press(
        screen.getByRole('button', { name: 'Revoke the invitation of invited4@example.com' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
    });
  });
});
