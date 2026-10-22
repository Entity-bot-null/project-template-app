import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, TextInput, View } from 'react-native';

import NotFoundRoute from '@/app/+not-found';
import { linkTokens } from '@/auth/linkTokens';
import { useSessionStore } from '@/auth/session';
import { ChangeEmailScreen } from '@/features/account/ChangeEmailScreen';
import { ChangePasswordScreen } from '@/features/account/ChangePasswordScreen';
import { DeleteAccountScreen } from '@/features/account/DeleteAccountScreen';
import { InvitationsScreen } from '@/features/admin/InvitationsScreen';
import { UsersScreen } from '@/features/admin/UsersScreen';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { SignUpScreen } from '@/features/auth/SignUpScreen';
import { ItemDetailScreen } from '@/features/items/ItemDetailScreen';
import { ItemsScreen } from '@/features/items/ItemsScreen';
import { NewItemScreen } from '@/features/items/NewItemScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { AcceptInvitationScreen } from '@/features/links/AcceptInvitationScreen';
import { ConfirmEmailChangeScreen } from '@/features/links/ConfirmEmailChangeScreen';
import { ConfirmSignUpScreen } from '@/features/links/ConfirmSignUpScreen';
import { ResetPasswordScreen } from '@/features/links/ResetPasswordScreen';
import { RevertEmailChangeScreen } from '@/features/links/RevertEmailChangeScreen';
import { UpdateRequiredScreen } from '@/features/update/UpdateRequiredScreen';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { inaccessibleControls } from '@/test/a11y';
import { contrastProblems } from '@/test/contrast';
import { account, capabilities, item, page, session as sessionFixture } from '@/test/fixtures';
import {
  accepted,
  deferred,
  failure,
  noContent,
  ok,
  stubFetch,
  type StubbedFetch,
} from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';
import { Text } from '@/ui';
import { themes } from '@/ui/theme/theme';
import { lightColors } from '@/ui/theme/tokens';

// The automated part of the accessibility gate over every screen of the
// template, in each of its states and in both color schemes
// (docs/accessibility.md#automated-checks): every control has a role and a
// name, and every text is readable on its background. Add each new screen,
// and each new state of a screen, here.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

let fetchStub: StubbedFetch;

const PASSWORD = 'a long enough passphrase';
const TOKEN = 'A11y_'.repeat(9).slice(0, 43);

beforeEach(async () => {
  fetchStub = stubFetch({
    'GET /api/users/me': () => ok(account),
    'GET /api/items': () => ok(page(0, 3, 3)),
    'GET /api/items/:id': () => ok(item(1)),
    'GET /api/auth/capabilities': () => ok(capabilities),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

describe.each(['light', 'dark'] as const)('every screen and state, in %s mode', (scheme) => {
  beforeEach(() => {
    usePreferences.setState({ ...DEFAULT_PREFERENCES, theme: scheme });
  });

  afterEach(async () => {
    await act(() => {
      usePreferences.setState(DEFAULT_PREFERENCES);
      useSessionStore.setState({ endedBy: null });
    });
  });

  /** What is on screen now passes both checks. */
  function expectUsable() {
    expect(inaccessibleControls()).toEqual([]);
    expect(contrastProblems(themes[scheme].colors.background)).toEqual([]);
  }

  it('onboarding', async () => {
    await renderWithProviders(<OnboardingScreen />);
    expectUsable();
  });

  it('sign-in: empty, with validation errors, refused, after an expired session', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => failure(401, 'Invalid credentials'));
    await act(() => {
      useSessionStore.setState({ endedBy: 'expired' });
    });
    await renderWithProviders(<SignInScreen />);
    expect(screen.getByText(/Your session has ended/)).toBeOnTheScreen();
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter your password');
    expectUsable();
    await userEvent.type(screen.getByLabelText('Email'), 'member@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Wrong email or password.');
    expectUsable();
  });

  it('the item list: loaded, loading more, searched without results, empty, failed', async () => {
    const nextPage = deferred();
    fetchStub.on('GET /api/items', (request) => {
      const params = new URL(request.url).searchParams;
      if (params.has('q')) return ok(page(0, 0, 0));
      return params.get('offset') === '0' ? ok(page(0, 20, 25)) : nextPage.promise;
    });
    const view = await renderWithProviders(<ItemsScreen />);
    await screen.findByText('Item 0');
    expectUsable();
    await fireEvent(screen.getByTestId('items-list'), 'onEndReached');
    await screen.findByRole('progressbar', { name: 'Loading more items' });
    expectUsable();
    nextPage.resolve(ok(page(20, 5, 25)));
    await waitFor(() => {
      expect(screen.queryByRole('progressbar', { name: 'Loading more items' })).toBeNull();
    });
    await userEvent.type(screen.getByLabelText('Search'), 'zzz');
    await screen.findByText('No results');
    expectUsable();
    await view.unmount();

    fetchStub.on('GET /api/items', () => ok(page(0, 0, 0)));
    const empty = await renderWithProviders(<ItemsScreen />);
    await screen.findByText('No items yet');
    expectUsable();
    await empty.unmount();

    fetchStub.on('GET /api/items', () => failure(503, 'Maintenance'));
    await renderWithProviders(<ItemsScreen />);
    await screen.findByRole('button', { name: 'Try again' });
    expectUsable();
  });

  it('an item: loaded, not found, failed', async () => {
    const view = await renderWithProviders(<ItemDetailScreen id="item-1" />);
    await screen.findByText('Item 1');
    expectUsable();
    await view.unmount();

    fetchStub.on('GET /api/items/:id', () => failure(404, 'Not found'));
    const missing = await renderWithProviders(<ItemDetailScreen id="gone" />);
    await screen.findByText('Item not found');
    expectUsable();
    await missing.unmount();

    fetchStub.on('GET /api/items/:id', () => failure(500, 'Boom'));
    await renderWithProviders(<ItemDetailScreen id="broken" />);
    await screen.findByRole('button', { name: 'Try again' });
    expectUsable();
  });

  it('the new item form: empty, with validation errors, failed', async () => {
    fetchStub.on('POST /api/items', () => failure(503, 'Maintenance'));
    await renderWithProviders(<NewItemScreen />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Enter a title');
    expectUsable();
    await userEvent.type(screen.getByLabelText('Title'), 'Groceries');
    await userEvent.press(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText(/on our side/);
    expectUsable();
  });

  it('settings: loaded, with the profile failing, and for an admin', async () => {
    const view = await renderWithProviders(<SettingsScreen />);
    await screen.findByText(account.email);
    expectUsable();
    await view.unmount();

    fetchStub.on('GET /api/users/me', () => failure(503, 'Maintenance'));
    const failed = await renderWithProviders(<SettingsScreen />);
    await screen.findByRole('button', { name: 'Try again' });
    expectUsable();
    await failed.unmount();

    await endTestSession(fetchStub);
    await signInForTest(fetchStub, { role: 'admin' });
    await renderWithProviders(<SettingsScreen />);
    await screen.findByRole('header', { name: 'Administration' });
    expectUsable();
  });

  it('update required', async () => {
    await renderWithProviders(<UpdateRequiredScreen />);
    expect(screen.getByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    expectUsable();
  });

  it('sign-up: empty, with validation errors, sent', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () => accepted());
    await renderWithProviders(<SignUpScreen />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Enter your name');
    expectUsable();
    await userEvent.type(screen.getByLabelText('Name'), 'New Person');
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repeat the password'), PASSWORD);
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByTestId('sign-up-sent');
    expectUsable();
  });

  it('password recovery: empty, refused, sent', async () => {
    const answers = [failure(503, 'Email is not configured'), noContent()];
    fetchStub.on('POST /api/auth/password-resets', () => answers.shift()!);
    await renderWithProviders(<ForgotPasswordScreen />);
    expectUsable();
    await userEvent.type(screen.getByLabelText('Email'), 'member@example.com');
    await userEvent.press(screen.getByRole('button', { name: 'Send the link' }));
    await screen.findByText(/on our side/);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Send the link' }));
    await screen.findByTestId('forgot-password-sent');
    expectUsable();
  });

  it('an emailed link that cannot be used', async () => {
    await renderWithProviders(<ResetPasswordScreen />);
    await screen.findByTestId('link-invalid');
    expectUsable();
  });

  it('a password reset link: the form, refused, done', async () => {
    const answers = [
      failure(400, 'password: too common', [
        { path: 'password', message: 'This password is one of the most used: choose another one.' },
      ]),
      noContent(),
    ];
    fetchStub.on('POST /api/auth/password-resets/confirm', () => answers.shift()!);
    linkTokens.keep('reset-password', TOKEN);
    await renderWithProviders(<ResetPasswordScreen />);
    expectUsable();
    await userEvent.type(screen.getByLabelText('New password'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repeat the new password'), PASSWORD);
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText(/one of the most used/);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByTestId('reset-password-done');
    expectUsable();
  });

  it('a sign-up link, signed in as another account: the notice, refused', async () => {
    fetchStub.on('POST /api/auth/sign-ups/confirm', () => failure(401, 'Not the password'));
    linkTokens.keep('confirm-sign-up', TOKEN);
    await renderWithProviders(<ConfirmSignUpScreen />);
    expect(screen.getByText(/continuing signs that account out/)).toBeOnTheScreen();
    expectUsable();
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText(/not the password you chose/);
    expectUsable();
  });

  it('an invitation link: the form, with validation errors, done', async () => {
    fetchStub.on('POST /api/auth/invitations/accept', () => ok(sessionFixture('inv')));
    linkTokens.keep('accept-invitation', TOKEN);
    await renderWithProviders(<AcceptInvitationScreen />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Enter your name');
    expectUsable();
    await userEvent.type(screen.getByLabelText('Name'), 'Invited');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repeat the password'), PASSWORD);
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByTestId('accept-invitation-done');
    expectUsable();
  });

  it('the email change links: confirm (refused), undo (the form)', async () => {
    fetchStub.on('POST /api/auth/email-changes/confirm', () => failure(409, 'Taken'));
    linkTokens.keep('confirm-email-change', TOKEN);
    const confirm = await renderWithProviders(<ConfirmEmailChangeScreen />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Confirm the new address' }));
    await screen.findByText(/Another account uses this address/);
    expectUsable();
    await confirm.unmount();

    linkTokens.keep('revert-email-change', TOKEN);
    await renderWithProviders(<RevertEmailChangeScreen />);
    expectUsable();
  });

  it('the account: change password (errors, done), change email (sent), delete (errors)', async () => {
    fetchStub.on('POST /api/account/password', () => ok(sessionFixture('renewed')));
    const password = await renderWithProviders(<ChangePasswordScreen onDone={jest.fn()} />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText('Choose a password');
    expectUsable();
    await userEvent.type(screen.getByLabelText('Current password'), 'the current one');
    await userEvent.type(screen.getByLabelText('New password'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repeat the new password'), PASSWORD);
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByTestId('change-password-done');
    expectUsable();
    await password.unmount();

    fetchStub.on('POST /api/account/email', () => accepted());
    const email = await renderWithProviders(<ChangeEmailScreen onDone={jest.fn()} />);
    expectUsable();
    await userEvent.type(screen.getByLabelText('New email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Current password'), 'the current one');
    await userEvent.press(screen.getByRole('button', { name: 'Send the link' }));
    await screen.findByTestId('change-email-sent');
    expectUsable();
    await email.unmount();

    await renderWithProviders(<DeleteAccountScreen />);
    expectUsable();
    await userEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await screen.findByText('Enter your password');
    expectUsable();
  });

  it('administration: users (loaded, empty, failed), invitations (with and without email)', async () => {
    fetchStub.on('GET /api/users', () => ok({ items: [{ ...account, role: 'admin' }], total: 1 }));
    const users = await renderWithProviders(<UsersScreen />);
    await screen.findByText(account.name);
    expectUsable();
    await users.unmount();

    fetchStub.on('GET /api/users', () => ok({ items: [], total: 0 }));
    const empty = await renderWithProviders(<UsersScreen />);
    await screen.findByText('No users');
    expectUsable();
    await empty.unmount();

    fetchStub.on('GET /api/users', () => failure(503, 'Maintenance'));
    const failed = await renderWithProviders(<UsersScreen />);
    await screen.findByRole('button', { name: 'Try again' });
    expectUsable();
    await failed.unmount();

    const invitation = {
      id: 'invitation-1',
      email: 'invited@example.com',
      role: 'member' as const,
      invitedBy: { id: account.id, name: account.name },
      createdAt: '2026-01-01T09:00:00.000Z',
      expiresAt: '2026-01-08T09:00:00.000Z',
    };
    fetchStub.on('GET /api/admin/invitations', () => ok({ items: [invitation], total: 1 }));
    const invitations = await renderWithProviders(<InvitationsScreen />);
    await screen.findByText('invited@example.com');
    expectUsable();
    await invitations.unmount();

    fetchStub.on('GET /api/auth/capabilities', () => ok({ ...capabilities, invitations: false }));
    await renderWithProviders(<InvitationsScreen />);
    await screen.findByText(/cannot send invitations/);
    expectUsable();
  });

  it('an unknown route', async () => {
    await renderWithProviders(<NotFoundRoute />);
    expect(screen.getByRole('button', { name: 'Go to the home screen' })).toBeOnTheScreen();
    expectUsable();
  });
});

describe('inaccessibleControls', () => {
  it('reports a pressable without a role or a name', async () => {
    await renderWithProviders(
      <Pressable onPress={() => undefined}>
        <View />
      </Pressable>,
    );
    expect(inaccessibleControls()).toEqual([
      'View (role none): no accessible name',
      'View "": no accessibility role',
    ]);
  });
});

describe('contrastProblems', () => {
  it('reports text and field edges below their minimum, on what they are drawn on', async () => {
    await renderWithProviders(
      <View>
        <View style={{ backgroundColor: lightColors.border }}>
          <Text tone="muted">Faint</Text>
        </View>
        <TextInput
          accessibilityLabel="Name"
          style={{ borderWidth: 1, borderColor: lightColors.border, color: lightColors.text }}
        />
      </View>,
    );
    expect(contrastProblems(lightColors.background)).toEqual([
      '"Faint": #55555E on #C2C2C9 is 4.16:1 (< 4.5:1)',
      'Border of the "Name" field: #C2C2C9 on #FFFFFF is 1.77:1 (< 3:1)',
    ]);
  });
});
