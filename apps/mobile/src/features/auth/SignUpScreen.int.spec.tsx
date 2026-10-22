import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { accepted, bodyOf, failure, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';

import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { SignUpScreen } from './SignUpScreen';

// UI → form → API client → (stubbed) API, for the signed-out account flows
// that end in an email: sign-up and password recovery.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { back: jest.fn() },
}));

const PASSWORD = 'a long enough passphrase';

let fetchStub: StubbedFetch;

beforeEach(() => {
  fetchStub = stubFetch({});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  fetchStub.restore();
});

function sent(path: string) {
  return fetchStub.requests.filter((request) => request.url.endsWith(path));
}

describe('SignUpScreen', () => {
  async function fill({
    name = 'New Person',
    email = 'New.Person@Example.com ',
    password = PASSWORD,
    repeat = password,
  }: { name?: string; email?: string; password?: string; repeat?: string } = {}) {
    const user = userEvent.setup();
    if (name) await user.type(screen.getByLabelText('Name'), name);
    if (email) await user.type(screen.getByLabelText('Email'), email);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    if (repeat) await user.type(screen.getByLabelText('Repeat the password'), repeat);
    await user.press(screen.getByRole('button', { name: 'Create account' }));
  }

  it('checks the fields before sending anything', async () => {
    await renderWithProviders(<SignUpScreen />);
    await fill({ name: '', email: 'nope', password: 'short', repeat: 'shorter' });
    expect(await screen.findByText('Enter your name')).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 15 characters.')).toBeOnTheScreen();
    expect(sent('/api/auth/sign-ups')).toHaveLength(0);
  });

  it('moves through the fields with the keyboard, and sends from the last one', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () => accepted());
    await renderWithProviders(<SignUpScreen />);
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('Name'), 'New Person');
    await typing.type(screen.getByLabelText('Email'), 'new@example.com');
    await typing.type(screen.getByLabelText('Password'), PASSWORD);
    await typing.type(screen.getByLabelText('Repeat the password'), PASSWORD);
    for (const label of ['Name', 'Email', 'Password']) {
      await fireEvent(screen.getByLabelText(label), 'submitEditing');
    }
    expect(sent('/api/auth/sign-ups')).toHaveLength(0);
    await fireEvent(screen.getByLabelText('Repeat the password'), 'submitEditing');
    expect(await screen.findByTestId('sign-up-sent')).toBeOnTheScreen();
  });

  it('refuses two different passwords', async () => {
    await renderWithProviders(<SignUpScreen />);
    await fill({ repeat: `${PASSWORD}!` });
    expect(await screen.findByText('The passwords do not match')).toBeOnTheScreen();
    expect(sent('/api/auth/sign-ups')).toHaveLength(0);
  });

  it('asks for the link, then says where it went without telling who has an account', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () => accepted());
    await renderWithProviders(<SignUpScreen />);
    await fill();
    expect(await screen.findByTestId('sign-up-sent')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /If new\.person@example\.com can be used, it got a link/,
    );
    expect(await bodyOf(sent('/api/auth/sign-ups')[0]!)).toEqual({
      name: 'New Person',
      email: 'new.person@example.com',
      password: PASSWORD,
    });
    await userEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('puts the server’s refusal of the password under it', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () =>
      failure(400, 'password: too common', [
        { path: 'password', message: 'This password is one of the most used: choose another one.' },
      ]),
    );
    await renderWithProviders(<SignUpScreen />);
    await fill();
    expect(await screen.findByText(/one of the most used/)).toBeOnTheScreen();
  });

  it('says so when this server takes no new accounts', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () => failure(403, 'Sign-up is closed'));
    await renderWithProviders(<SignUpScreen />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not take new accounts/);
  });

  it('says offline when the network is down', async () => {
    fetchStub.on('POST /api/auth/sign-ups', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await renderWithProviders(<SignUpScreen />);
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });
});

describe('ForgotPasswordScreen', () => {
  async function fill(email: string) {
    const user = userEvent.setup();
    if (email) await user.type(screen.getByLabelText('Email'), email);
    await user.press(screen.getByRole('button', { name: 'Send the link' }));
  }

  it('sends from the keyboard', async () => {
    fetchStub.on('POST /api/auth/password-resets', () => new Response(null, { status: 204 }));
    await renderWithProviders(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'member@example.com');
    await fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    await waitFor(() => {
      expect(sent('/api/auth/password-resets')).toHaveLength(1);
    });
  });

  it('checks the address before sending anything', async () => {
    await renderWithProviders(<ForgotPasswordScreen />);
    await fill('');
    expect(await screen.findByText('Enter your email address')).toBeOnTheScreen();
    expect(sent('/api/auth/password-resets')).toHaveLength(0);
  });

  it('asks for the link with a normalized address, the same answer for any address', async () => {
    fetchStub.on('POST /api/auth/password-resets', () => new Response(null, { status: 204 }));
    await renderWithProviders(<ForgotPasswordScreen />);
    await fill(' Member@Example.com');
    expect(await screen.findByTestId('forgot-password-sent')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /If member@example\.com has an account, it got a link/,
    );
    expect(await bodyOf(sent('/api/auth/password-resets')[0]!)).toEqual({
      email: 'member@example.com',
    });
    await userEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('puts a field error under the field, and anything else for the whole form', async () => {
    fetchStub.on('POST /api/auth/password-resets', () =>
      failure(400, 'email: invalid', [{ path: 'email', message: 'Invalid email address' }]),
    );
    const view = await renderWithProviders(<ForgotPasswordScreen />);
    await fill('member@example.com');
    expect(await screen.findByText('Invalid email address')).toBeOnTheScreen();
    await view.unmount();

    // A server that sends no email.
    fetchStub.on('POST /api/auth/password-resets', () => failure(503, 'Email is not configured'));
    await renderWithProviders(<ForgotPasswordScreen />);
    await fill('member@example.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(/on our side/);
  });
});
