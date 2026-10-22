import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { linkTokens } from '@/auth/linkTokens';
import { useSessionStore } from '@/auth/session';
import { LINK_TOKEN_SCREENS } from '@/lib/links';
import { session as sessionFixture, user } from '@/test/fixtures';
import { bodyOf, failure, noContent, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { AcceptInvitationScreen } from './AcceptInvitationScreen';
import { ConfirmEmailChangeScreen } from './ConfirmEmailChangeScreen';
import { ConfirmSignUpScreen } from './ConfirmSignUpScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { RevertEmailChangeScreen } from './RevertEmailChangeScreen';

// The screens of emailed links: UI → the link's token (src/auth/linkTokens.ts)
// → API client → (stubbed) API, and the session when the link signs in.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { replace: jest.fn() },
}));

const TOKEN = 'Tk3_-'.repeat(9).slice(0, 43);
const PASSWORD = 'a long enough passphrase';

let fetchStub: StubbedFetch;

beforeEach(() => {
  fetchStub = stubFetch({});
  useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  for (const screen of LINK_TOKEN_SCREENS) linkTokens.take(screen);
  await endTestSession(fetchStub);
  fetchStub.restore();
});

function sent(path: string) {
  return fetchStub.requests.filter((request) => request.url.endsWith(path));
}

async function typePasswords(label: string, password = PASSWORD, repeat = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(label), password);
  await user.type(screen.getByLabelText(`Repeat the ${label.toLowerCase()}`), repeat);
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

describe('a link that cannot be used', () => {
  it.each([
    ['confirm-sign-up', ConfirmSignUpScreen],
    ['accept-invitation', AcceptInvitationScreen],
    ['confirm-email-change', ConfirmEmailChangeScreen],
    ['revert-email-change', RevertEmailChangeScreen],
  ] as const)('%s without its token: says so, and leads on', async (_screen, LinkScreen) => {
    await renderWithProviders(<LinkScreen />);
    expect(screen.getByTestId('link-invalid')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/expired, was already used/);
    await userEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('a password reset without its token offers to ask for a new link', async () => {
    await renderWithProviders(<ResetPasswordScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Ask for a new link' }));
    expect(router.replace).toHaveBeenCalledWith('/forgot-password');
  });

  it('takes the token once: the same link opened twice works once', async () => {
    linkTokens.keep('reset-password', TOKEN);
    const first = await renderWithProviders(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-screen')).toBeOnTheScreen();
    await first.unmount();
    await renderWithProviders(<ResetPasswordScreen />);
    expect(screen.getByTestId('link-invalid')).toBeOnTheScreen();
  });

  it('leads a signed-in user back to the app', async () => {
    await signInForTest(fetchStub);
    await renderWithProviders(<ConfirmEmailChangeScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    linkTokens.keep('reset-password', TOKEN);
  });

  it('sets the new password with the link’s token', async () => {
    fetchStub.on('POST /api/auth/password-resets/confirm', () => noContent());
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByTestId('reset-password-done')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/Sign in with your new password/);
    expect(await bodyOf(sent('/password-resets/confirm')[0]!)).toEqual({
      token: TOKEN,
      password: PASSWORD,
    });
    await userEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/auth/password-resets/confirm', () => noContent());
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password');
    await sendWithKeyboard(['New password', 'Repeat the new password'], '/password-resets/confirm');
  });

  it('keeps the link usable after a refused password: the retry sends the same token', async () => {
    const answers = [
      failure(400, 'password: too common', [
        { path: 'password', message: 'This password is one of the most used: choose another one.' },
      ]),
      noContent(),
    ];
    fetchStub.on('POST /api/auth/password-resets/confirm', () => answers.shift()!);
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/one of the most used/)).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByTestId('reset-password-done')).toBeOnTheScreen();
    const tokens = await Promise.all(sent('/password-resets/confirm').map(bodyOf));
    expect(tokens.map((body) => (body as { token: string }).token)).toEqual([TOKEN, TOKEN]);
  });

  it('says the link cannot be used when the server refuses it', async () => {
    fetchStub.on('POST /api/auth/password-resets/confirm', () => failure(404, 'Not found'));
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByTestId('link-invalid')).toBeOnTheScreen();
  });

  it('checks the passwords before sending anything', async () => {
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password', PASSWORD, 'something else entirely');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The passwords do not match')).toBeOnTheScreen();
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('says offline when the network is down', async () => {
    fetchStub.on('POST /api/auth/password-resets/confirm', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await renderWithProviders(<ResetPasswordScreen />);
    await typePasswords('New password');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });
});

describe('ConfirmSignUpScreen', () => {
  beforeEach(() => {
    linkTokens.keep('confirm-sign-up', TOKEN);
  });

  async function confirm(password = PASSWORD) {
    await userEvent.type(screen.getByLabelText('Password'), password);
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
  }

  it('creates the account and signs it in', async () => {
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => ok(sessionFixture('new')));
    await renderWithProviders(<ConfirmSignUpScreen />);
    await confirm();
    expect(await screen.findByTestId('confirm-sign-up-done')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Welcome, ${user.name}. You are signed in.`,
    );
    expect(useSessionStore.getState()).toEqual({ status: 'signedIn', endedBy: null, user });
    expect(await bodyOf(sent('/sign-ups/confirm')[0]!)).toEqual({
      token: TOKEN,
      password: PASSWORD,
    });
    await userEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('sends from the keyboard', async () => {
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => ok(sessionFixture('new')));
    await renderWithProviders(<ConfirmSignUpScreen />);
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await sendWithKeyboard(['Password'], '/sign-ups/confirm');
  });

  it.each([
    [401, 'Not the password', /This is not the password you chose when signing up\./],
    [409, 'An account with this address exists', /This address has an account already/],
    [403, 'Sign-up is closed', /This server does not take new accounts any more\./],
    [503, 'Maintenance', /on our side/],
  ])('answers %i in the user’s words', async (status, message, shown) => {
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => failure(status, message));
    await renderWithProviders(<ConfirmSignUpScreen />);
    await confirm();
    expect(await screen.findByText(shown)).toBeOnTheScreen();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('says the link cannot be used when the server refuses it', async () => {
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => failure(404, 'Not found'));
    await renderWithProviders(<ConfirmSignUpScreen />);
    await confirm();
    expect(await screen.findByTestId('link-invalid')).toBeOnTheScreen();
  });

  it('warns a signed-in user that continuing signs that account out', async () => {
    await signInForTest(fetchStub);
    await renderWithProviders(<ConfirmSignUpScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      `You are signed in as ${user.email}: continuing signs that account out.`,
    );
  });
});

describe('AcceptInvitationScreen', () => {
  beforeEach(() => {
    linkTokens.keep('accept-invitation', TOKEN);
  });

  async function accept(name = 'Invited Person') {
    if (name) await userEvent.type(screen.getByLabelText('Name'), name);
    await typePasswords('Password');
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
  }

  it('creates the account with a name and a password, and signs it in', async () => {
    const invited = { ...user, id: 'user-invited', name: 'Invited Person', role: 'admin' as const };
    fetchStub.on('POST /api/auth/invitations/accept', () => ok(sessionFixture('inv', invited)));
    await renderWithProviders(<AcceptInvitationScreen />);
    await accept();
    expect(await screen.findByTestId('accept-invitation-done')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Welcome, Invited Person. You are signed in.',
    );
    expect(useSessionStore.getState().user).toEqual(invited);
    expect(await bodyOf(sent('/invitations/accept')[0]!)).toEqual({
      token: TOKEN,
      name: 'Invited Person',
      password: PASSWORD,
    });
  });

  it('puts field errors under their fields, and says an existing account for the form', async () => {
    fetchStub.on('POST /api/auth/invitations/accept', () =>
      failure(400, 'name: invalid', [{ path: 'name', message: 'Between 1 and 100 characters' }]),
    );
    const view = await renderWithProviders(<AcceptInvitationScreen />);
    await accept();
    expect(await screen.findByText('Between 1 and 100 characters')).toBeOnTheScreen();
    await view.unmount();

    linkTokens.keep('accept-invitation', TOKEN);
    fetchStub.on('POST /api/auth/invitations/accept', () =>
      failure(409, 'An account with this address exists'),
    );
    await renderWithProviders(<AcceptInvitationScreen />);
    await accept();
    expect(await screen.findByRole('alert')).toHaveTextContent(/has an account already/);
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/auth/invitations/accept', () => ok(sessionFixture('inv')));
    await renderWithProviders(<AcceptInvitationScreen />);
    await userEvent.type(screen.getByLabelText('Name'), 'Invited Person');
    await typePasswords('Password');
    await sendWithKeyboard(['Name', 'Password', 'Repeat the password'], '/invitations/accept');
  });

  it('says another failure for the whole form', async () => {
    fetchStub.on('POST /api/auth/invitations/accept', () => failure(503, 'Maintenance'));
    await renderWithProviders(<AcceptInvitationScreen />);
    await accept();
    expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
  });

  it('says the link cannot be used when the invitation was revoked or replaced', async () => {
    fetchStub.on('POST /api/auth/invitations/accept', () => failure(404, 'Not found'));
    await renderWithProviders(<AcceptInvitationScreen />);
    await accept();
    expect(await screen.findByTestId('link-invalid')).toBeOnTheScreen();
  });

  it('checks the fields before sending anything', async () => {
    await renderWithProviders(<AcceptInvitationScreen />);
    await accept('');
    expect(await screen.findByText('Enter your name')).toBeOnTheScreen();
    expect(fetchStub.requests).toHaveLength(0);
  });
});

describe('ConfirmEmailChangeScreen', () => {
  beforeEach(() => {
    linkTokens.keep('confirm-email-change', TOKEN);
  });

  it('changes nothing until the user confirms', async () => {
    fetchStub.on('POST /api/auth/email-changes/confirm', () => noContent());
    await renderWithProviders(<ConfirmEmailChangeScreen />);
    expect(fetchStub.requests).toHaveLength(0);
    await userEvent.press(screen.getByRole('button', { name: 'Confirm the new address' }));
    expect(await screen.findByTestId('confirm-email-change-done')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/Sign in again with your new address/);
    expect(await bodyOf(sent('/email-changes/confirm')[0]!)).toEqual({ token: TOKEN });
  });

  it.each([
    [409, /Another account uses this address now/],
    [503, /on our side/],
  ])('answers %i in the user’s words', async (status, shown) => {
    fetchStub.on('POST /api/auth/email-changes/confirm', () => failure(status, 'Refused'));
    await renderWithProviders(<ConfirmEmailChangeScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Confirm the new address' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
  });

  it('says the link cannot be used when the server refuses it', async () => {
    fetchStub.on('POST /api/auth/email-changes/confirm', () => failure(404, 'Not found'));
    await renderWithProviders(<ConfirmEmailChangeScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Confirm the new address' }));
    expect(await screen.findByTestId('link-invalid')).toBeOnTheScreen();
  });
});

describe('RevertEmailChangeScreen', () => {
  beforeEach(() => {
    linkTokens.keep('revert-email-change', TOKEN);
  });

  async function revert() {
    await typePasswords('New password');
    await userEvent.press(screen.getByRole('button', { name: 'Undo the change' }));
  }

  it('brings the previous address back with a new password', async () => {
    fetchStub.on('POST /api/auth/email-changes/revert', () => noContent());
    await renderWithProviders(<RevertEmailChangeScreen />);
    await revert();
    expect(await screen.findByTestId('revert-email-change-done')).toBeOnTheScreen();
    expect(await bodyOf(sent('/email-changes/revert')[0]!)).toEqual({
      token: TOKEN,
      password: PASSWORD,
    });
  });

  it.each([
    [409, undefined, /Another account uses your previous address now/],
    [
      400,
      [
        {
          path: 'password',
          message: 'Leave your email address and your name out of your password.',
        },
      ],
      /Leave your email address/,
    ],
  ])('answers %i in the user’s words', async (status, errors, shown) => {
    fetchStub.on('POST /api/auth/email-changes/revert', () => failure(status, 'Refused', errors));
    await renderWithProviders(<RevertEmailChangeScreen />);
    await revert();
    expect(await screen.findByText(shown)).toBeOnTheScreen();
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/auth/email-changes/revert', () => noContent());
    await renderWithProviders(<RevertEmailChangeScreen />);
    await typePasswords('New password');
    await sendWithKeyboard(['New password', 'Repeat the new password'], '/email-changes/revert');
  });

  it('says another failure for the whole form', async () => {
    fetchStub.on('POST /api/auth/email-changes/revert', () => failure(503, 'Maintenance'));
    await renderWithProviders(<RevertEmailChangeScreen />);
    await revert();
    expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
  });

  it('says the link cannot be used when the server refuses it', async () => {
    fetchStub.on('POST /api/auth/email-changes/revert', () => failure(404, 'Not found'));
    await renderWithProviders(<RevertEmailChangeScreen />);
    await revert();
    expect(await screen.findByTestId('link-invalid')).toBeOnTheScreen();
  });
});

describe('SignedInNotice', () => {
  it('names no account while a session restored offline does not know it yet', async () => {
    linkTokens.keep('accept-invitation', TOKEN);
    await act(() => {
      useSessionStore.setState({ status: 'signedIn', endedBy: null, user: null });
    });
    await renderWithProviders(<AcceptInvitationScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Another account is signed in on this phone: continuing signs it out.',
    );
    await act(() => {
      useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
    });
  });
});
