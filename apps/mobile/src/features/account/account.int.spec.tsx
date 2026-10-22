import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { session, useSessionStore } from '@/auth/session';
import { secureStorage, STORAGE_KEYS } from '@/lib/storage';
import { session as sessionFixture, user } from '@/test/fixtures';
import {
  accepted,
  bodyOf,
  failure,
  noContent,
  ok,
  stubFetch,
  type StubbedFetch,
} from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { ChangeEmailScreen } from './ChangeEmailScreen';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { DeleteAccountScreen } from './DeleteAccountScreen';

// The signed-in user's own account: UI → form → session → API client →
// (stubbed) API.

const CURRENT = 'the current password';
const NEW = 'a brand new passphrase';

let fetchStub: StubbedFetch;

beforeEach(async () => {
  fetchStub = stubFetch({ 'POST /api/auth/logout': () => noContent() });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

function sent(path: string) {
  return fetchStub.requests.filter((request) => request.url.endsWith(path));
}

/**
 * The keyboard on a typed form: each label but the last moves on without
 * sending; the last one sends to `path`.
 */
async function sendWithKeyboard(labels: string[], path: string) {
  for (const label of labels.slice(0, -1)) {
    await fireEvent(screen.getByLabelText(label), 'submitEditing');
  }
  expect(sent(path)).toHaveLength(0);
  await fireEvent(screen.getByLabelText(labels.at(-1)!), 'submitEditing');
  await waitFor(() => {
    expect(sent(path)).toHaveLength(1);
  });
}

describe('ChangePasswordScreen', () => {
  async function change({
    current = CURRENT,
    password = NEW,
    repeat = password,
  }: { current?: string; password?: string; repeat?: string } = {}) {
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('Current password'), current);
    await typing.type(screen.getByLabelText('New password'), password);
    await typing.type(screen.getByLabelText('Repeat the new password'), repeat);
    await typing.press(screen.getByRole('button', { name: 'Change password' }));
  }

  it('changes it, and this phone carries on with the session the API answers', async () => {
    fetchStub.on('POST /api/account/password', () => ok(sessionFixture('renewed')));
    const onDone = jest.fn();
    await renderWithProviders(<ChangePasswordScreen onDone={onDone} />);
    await change();
    expect(await screen.findByTestId('change-password-done')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/Every other device/);
    expect(await bodyOf(sent('/api/account/password')[0]!)).toEqual({
      currentPassword: CURRENT,
      newPassword: NEW,
    });
    expect(sent('/api/account/password')[0]!.headers.get('Authorization')).toBe(
      'Bearer access-test',
    );
    await expect(session.getAccessToken()).resolves.toBe('access-renewed');
    await expect(secureStorage.getItem(STORAGE_KEYS.refreshToken)).resolves.toBe('refresh-renewed');
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    await userEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/account/password', () => ok(sessionFixture('renewed')));
    await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('Current password'), CURRENT);
    await typing.type(screen.getByLabelText('New password'), NEW);
    await typing.type(screen.getByLabelText('Repeat the new password'), NEW);
    await sendWithKeyboard(
      ['Current password', 'New password', 'Repeat the new password'],
      '/api/account/password',
    );
  });

  it('puts a wrong current password and a refused new one under their fields', async () => {
    fetchStub.on('POST /api/account/password', () => failure(403, 'The current password is wrong'));
    const view = await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    await change();
    expect(await screen.findByText('The current password is wrong.')).toBeOnTheScreen();
    await view.unmount();

    fetchStub.on('POST /api/account/password', () =>
      failure(400, 'newPassword: too easy', [
        {
          path: 'newPassword',
          message: 'This password is too easy to guess: avoid repeated characters and sequences.',
        },
      ]),
    );
    await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    await change();
    expect(await screen.findByText(/too easy to guess/)).toBeOnTheScreen();
    await expect(session.getAccessToken()).resolves.toBe('access-test');
  });

  it('checks the new password before sending anything', async () => {
    await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    await change({ password: 'short', repeat: 'short' });
    expect(await screen.findByText('Use at least 15 characters.')).toBeOnTheScreen();
    expect(sent('/api/account/password')).toHaveLength(0);
  });

  it('says the rest for the whole form', async () => {
    fetchStub.on('POST /api/account/password', () =>
      failure(409, 'The password changed meanwhile'),
    );
    await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    await change();
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed elsewhere/);
  });
});

describe('ChangeEmailScreen', () => {
  async function ask(newEmail = ' New.Address@Example.com', password = CURRENT) {
    const typing = userEvent.setup();
    if (newEmail) await typing.type(screen.getByLabelText('New email'), newEmail);
    if (password) await typing.type(screen.getByLabelText('Current password'), password);
    await typing.press(screen.getByRole('button', { name: 'Send the link' }));
  }

  it('asks for the link to the new address, and says where it went', async () => {
    fetchStub.on('POST /api/account/email', () => accepted());
    fetchStub.on('GET /api/users/me', () => ok({ ...user, createdAt: '2026-01-01T00:00:00.000Z' }));
    const onDone = jest.fn();
    await renderWithProviders(<ChangeEmailScreen onDone={onDone} />);
    await ask();
    expect(await screen.findByTestId('change-email-sent')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /We sent a link to new\.address@example\.com/,
    );
    expect(await bodyOf(sent('/api/account/email')[0]!)).toEqual({
      newEmail: 'new.address@example.com',
      currentPassword: CURRENT,
    });
    await userEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/account/email', () => accepted());
    fetchStub.on('GET /api/users/me', () => ok({ ...user, createdAt: '2026-01-01T00:00:00.000Z' }));
    await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('New email'), 'new@example.com');
    await typing.type(screen.getByLabelText('Current password'), CURRENT);
    await sendWithKeyboard(['New email', 'Current password'], '/api/account/email');
  });

  it('puts a wrong password and the current address under their fields', async () => {
    fetchStub.on('POST /api/account/email', () => failure(403, 'The current password is wrong'));
    const view = await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    await ask();
    expect(await screen.findByText('The current password is wrong.')).toBeOnTheScreen();
    await view.unmount();

    fetchStub.on('POST /api/account/email', () =>
      failure(400, 'newEmail: same', [
        { path: 'newEmail', message: 'This is already the address of the account' },
      ]),
    );
    await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    await ask();
    expect(await screen.findByText('This is already the address of the account')).toBeOnTheScreen();
  });

  it('checks the fields before sending anything, and says a server failure for the form', async () => {
    const view = await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    await ask('nope', '');
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password')).toBeOnTheScreen();
    expect(sent('/api/account/email')).toHaveLength(0);
    await view.unmount();

    fetchStub.on('POST /api/account/email', () => failure(503, 'Email is not configured'));
    await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    await ask();
    expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
  });
});

describe('DeleteAccountScreen', () => {
  /** Answers the destructive confirmation with `choice`. */
  function confirmWith(choice: 'Delete account' | 'Cancel') {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons!.find((button) => button.text === choice)?.onPress?.();
    });
  }

  async function deleteWith(password = CURRENT) {
    if (password) await userEvent.type(screen.getByLabelText('Password'), password);
    await userEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  }

  it('deletes it after a destructive confirmation, then ends the session here', async () => {
    confirmWith('Delete account');
    fetchStub.on('POST /api/account/deletion', () => noContent());
    await renderWithProviders(<DeleteAccountScreen />);
    expect(
      screen.getByRole('header', { name: 'This deletes your account for good' }),
    ).toBeOnTheScreen();
    await deleteWith();
    await waitFor(() => {
      expect(useSessionStore.getState()).toEqual({
        status: 'signedOut',
        endedBy: 'user',
        user: null,
      });
    });
    expect(await bodyOf(sent('/api/account/deletion')[0]!)).toEqual({ password: CURRENT });
    await expect(secureStorage.getItem(STORAGE_KEYS.refreshToken)).resolves.toBeNull();
    // The server ended every session itself: nothing is left to revoke.
    expect(sent('/api/auth/logout')).toHaveLength(0);
  });

  it('sends nothing when the user cancels, or without the password', async () => {
    const alert = confirmWith('Cancel');
    await renderWithProviders(<DeleteAccountScreen />);
    await deleteWith('');
    expect(await screen.findByText('Enter your password')).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
    await deleteWith();
    await waitFor(() => {
      expect(alert).toHaveBeenCalled();
    });
    expect(sent('/api/account/deletion')).toHaveLength(0);
    expect(useSessionStore.getState().status).toBe('signedIn');
  });

  it('sends nothing when the confirmation is dismissed (Android back, a tap outside)', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, _buttons, options) => {
        options?.onDismiss?.();
      });
    await renderWithProviders(<DeleteAccountScreen />);
    await deleteWith();
    await waitFor(() => {
      expect(alert).toHaveBeenCalled();
    });
    expect(sent('/api/account/deletion')).toHaveLength(0);
  });

  it('puts a wrong password under the field', async () => {
    confirmWith('Delete account');
    fetchStub.on('POST /api/account/deletion', () => failure(403, 'The password is wrong'));
    await renderWithProviders(<DeleteAccountScreen />);
    await deleteWith();
    expect(await screen.findByText('The password is wrong.')).toBeOnTheScreen();
    expect(useSessionStore.getState().status).toBe('signedIn');
  });

  it('tells the only administrator what to do first', async () => {
    await endTestSession(fetchStub);
    await signInForTest(fetchStub, { role: 'admin' });
    confirmWith('Delete account');
    fetchStub.on('POST /api/account/deletion', () =>
      failure(409, 'The only administrator cannot delete their account'),
    );
    await renderWithProviders(<DeleteAccountScreen />);
    await deleteWith();
    expect(await screen.findByRole('alert')).toHaveTextContent(/You are the only administrator/);
  });

  it('says a conflict of a member, and other failures, for the whole form', async () => {
    confirmWith('Delete account');
    fetchStub.on('POST /api/account/deletion', () =>
      failure(409, 'The password changed meanwhile'),
    );
    await renderWithProviders(<DeleteAccountScreen />);
    await deleteWith();
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed elsewhere/);
    fetchStub.on('POST /api/account/deletion', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await userEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText(/offline/)).toBeOnTheScreen();
  });
});
