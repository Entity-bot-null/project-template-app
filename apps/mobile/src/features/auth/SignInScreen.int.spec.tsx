import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useSessionStore } from '@/auth/session';
import { secureStorage, STORAGE_KEYS } from '@/lib/storage';
import { capabilities, session as sessionFixture } from '@/test/fixtures';
import { bodyOf, deferred, failure, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession } from '@/test/session';

import { capabilitiesKey } from './api';
import { SignInScreen } from './SignInScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { push: jest.fn() },
}));

// UI → form → session → API client → (stubbed) API.

let fetchStub: StubbedFetch;

beforeEach(() => {
  fetchStub = stubFetch({ 'GET /api/auth/capabilities': () => ok(capabilities) });
  useSessionStore.setState({ status: 'signedOut', endedBy: null, user: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

function signIns() {
  return fetchStub.requests.filter((request) => request.url.endsWith('/api/auth/sign-in'));
}

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignInScreen', () => {
  it('validates before sending anything', async () => {
    await renderWithProviders(<SignInScreen />);
    await fill('not-an-email', '');
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password')).toBeOnTheScreen();
    expect(signIns()).toHaveLength(0);
  });

  it('signs in with a normalized email and keeps the session in secure storage', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('1')));
    await renderWithProviders(<SignInScreen />);
    await fill('  Member@Example.com ', 'correct horse');
    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe('signedIn');
    });
    expect(await bodyOf(signIns()[0]!)).toEqual({
      email: 'member@example.com',
      password: 'correct horse',
    });
    await expect(secureStorage.getItem(STORAGE_KEYS.refreshToken)).resolves.toBe('refresh-1');
  });

  it('moves to the password with the keyboard, and signs in from there', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('1')));
    await renderWithProviders(<SignInScreen />);
    const typing = userEvent.setup();
    await typing.type(screen.getByLabelText('Email'), 'member@example.com');
    await typing.type(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    expect(signIns()).toHaveLength(0);
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe('signedIn');
    });
  });

  it('answers wrong credentials with one generic message', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => failure(401, 'Invalid email or password'));
    await renderWithProviders(<SignInScreen />);
    await fill('member@example.com', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('puts server field errors under their field', async () => {
    fetchStub.on('POST /api/auth/sign-in', () =>
      failure(400, 'Invalid body', [{ path: 'email', message: 'Unknown domain' }]),
    );
    await renderWithProviders(<SignInScreen />);
    await fill('member@example.com', 'pw');
    expect(await screen.findByText('Unknown domain')).toBeOnTheScreen();
  });

  it('says it for the whole form when the server names no field of it', async () => {
    fetchStub.on('POST /api/auth/sign-in', () =>
      failure(400, 'Invalid body', [{ path: 'captcha', message: 'Required' }]),
    );
    await renderWithProviders(<SignInScreen />);
    await fill('member@example.com', 'pw');
    expect(await screen.findByRole('alert')).toHaveTextContent('Some fields need your attention.');
  });

  it('says offline when the network is down', async () => {
    fetchStub.on('POST /api/auth/sign-in', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await renderWithProviders(<SignInScreen />);
    await fill('member@example.com', 'pw');
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });

  it('leads to password recovery and sign-up when the server offers them', async () => {
    await renderWithProviders(<SignInScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Forgot your password?' }));
    expect(router.push).toHaveBeenCalledWith('/forgot-password');
    await userEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(router.push).toHaveBeenCalledWith('/sign-up');
  });

  it('offers neither while the server has not said, nor when it does not offer them', async () => {
    const answer = deferred();
    fetchStub.on('GET /api/auth/capabilities', () => answer.promise);
    const { queryClient } = await renderWithProviders(<SignInScreen />);
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).toBeNull();
    answer.resolve(ok({ ...capabilities, passwordReset: false, signUp: false }));
    await waitFor(() => {
      expect(queryClient.getQueryState(capabilitiesKey)?.status).toBe('success');
    });
    expect(screen.queryByRole('button', { name: 'Forgot your password?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create an account' })).toBeNull();
  });

  it('explains why the user was signed out', async () => {
    useSessionStore.setState({ status: 'signedOut', endedBy: 'expired' });
    await renderWithProviders(<SignInScreen />);
    expect(
      screen.getByText('Your session has ended. Sign in again to continue.'),
    ).toBeOnTheScreen();
  });
});
