import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/auth/session';
import { secureStorage, STORAGE_KEYS } from '@/lib/storage';
import { session as sessionFixture } from '@/test/fixtures';
import { bodyOf, failure, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession } from '@/test/session';

import { SignInScreen } from './SignInScreen';

// UI → form → session → API client → (stubbed) API.

let fetchStub: StubbedFetch;

beforeEach(() => {
  fetchStub = stubFetch({});
  useSessionStore.setState({ status: 'signedOut', endedBy: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

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
    expect(fetchStub.requests).toHaveLength(0);
  });

  it('signs in with a normalized email and keeps the session in secure storage', async () => {
    fetchStub.on('POST /api/auth/sign-in', () => ok(sessionFixture('1')));
    await renderWithProviders(<SignInScreen />);
    await fill('  Member@Example.com ', 'correct horse');
    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe('signedIn');
    });
    expect(await bodyOf(fetchStub.requests[0]!)).toEqual({
      email: 'member@example.com',
      password: 'correct horse',
    });
    await expect(secureStorage.getItem(STORAGE_KEYS.refreshToken)).resolves.toBe('refresh-1');
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

  it('says offline when the network is down', async () => {
    fetchStub.on('POST /api/auth/sign-in', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await renderWithProviders(<SignInScreen />);
    await fill('member@example.com', 'pw');
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });

  it('explains why the user was signed out', async () => {
    useSessionStore.setState({ status: 'signedOut', endedBy: 'expired' });
    await renderWithProviders(<SignInScreen />);
    expect(
      screen.getByText('Your session has ended. Sign in again to continue.'),
    ).toBeOnTheScreen();
  });
});
