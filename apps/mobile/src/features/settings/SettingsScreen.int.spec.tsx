import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useSessionStore } from '@/auth/session';
import { capabilitiesKey } from '@/features/auth/api';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { account, capabilities } from '@/test/fixtures';
import { failure, noContent, ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { SettingsScreen } from './SettingsScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { push: jest.fn() },
}));
// A phone with push available: a device, and an EAS project.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));

let fetchStub: StubbedFetch;

beforeEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  fetchStub = stubFetch({
    'GET /api/users/me': () => ok(account),
    'GET /api/auth/capabilities': () => ok(capabilities),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

describe('SettingsScreen', () => {
  it("shows the signed-in user's profile", async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByRole('header', { name: account.name })).toBeOnTheScreen();
    expect(screen.getByText(account.email)).toBeOnTheScreen();
  });

  it('leads to the account’s screens: password, email, deletion', async () => {
    await renderWithProviders(<SettingsScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Change email' }));
    expect(router.push).toHaveBeenCalledWith('/account/change-email');
    await userEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(router.push).toHaveBeenCalledWith('/account/change-password');
    await userEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(router.push).toHaveBeenCalledWith('/account/delete-account');
  });

  it('offers no change of email on a server that sends no email, and keeps the rest when the profile fails', async () => {
    fetchStub.on('GET /api/auth/capabilities', () => ok({ ...capabilities, emailChange: false }));
    fetchStub.on('GET /api/users/me', () => failure(503, 'Maintenance'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { queryClient } = await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    await waitFor(() => {
      expect(queryClient.getQueryState(capabilitiesKey)?.status).toBe('success');
    });
    expect(screen.getByRole('button', { name: 'Change password' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Change email' })).toBeNull();

    fetchStub.on('GET /api/users/me', () => ok(account));
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(account.email)).toBeOnTheScreen();
  });

  it('shows the administration to an admin only', async () => {
    const memberView = await renderWithProviders(<SettingsScreen />);
    await screen.findByText(account.email);
    expect(screen.queryByRole('header', { name: 'Administration' })).toBeNull();
    await memberView.unmount();

    await endTestSession(fetchStub);
    await signInForTest(fetchStub, { role: 'admin' });
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByRole('header', { name: 'Administration' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Users' }));
    expect(router.push).toHaveBeenCalledWith('/admin/users');
    await userEvent.press(screen.getByRole('button', { name: 'Invitations' }));
    expect(router.push).toHaveBeenCalledWith('/admin/invitations');
  });

  it('tells support which binary and update it runs', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(/^Version \S+ \(\S+\)$/)).toBeOnTheScreen();
    expect(screen.getByText('Update built-in')).toBeOnTheScreen();
  });

  it('switches the theme as an accessible radio group', async () => {
    await renderWithProviders(<SettingsScreen />);
    const dark = await screen.findByRole('radio', { name: 'Dark theme' });
    expect(dark).not.toBeChecked();
    await userEvent.press(dark);
    expect(usePreferences.getState().theme).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
  });

  it('records analytics consent, off by default', async () => {
    await renderWithProviders(<SettingsScreen />);
    const toggle = await screen.findByRole('switch', { name: 'Share usage analytics' });
    expect(toggle).not.toBeChecked();
    await fireEvent(toggle, 'valueChange', true);
    expect(usePreferences.getState().analyticsConsent).toBe('granted');
    expect(screen.getByRole('switch', { name: 'Share usage analytics' })).toBeChecked();
    await fireEvent(
      screen.getByRole('switch', { name: 'Share usage analytics' }),
      'valueChange',
      false,
    );
    expect(usePreferences.getState().analyticsConsent).toBe('denied');
  });

  it('asks for notifications only when the user taps Allow', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await userEvent.press(await screen.findByRole('button', { name: 'Allow' }));
    await waitFor(() => {
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });
  });

  it('registers this phone for push notifications once the user allows them', async () => {
    const granted = { granted: true, canAskAgain: true, status: 'granted' } as never;
    jest.mocked(Notifications.requestPermissionsAsync).mockImplementation(() => {
      jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
      return Promise.resolve(granted);
    });
    fetchStub.on('PUT /api/devices/:installationId', () => noContent());
    await renderWithProviders(<SettingsScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Allow' }));
    await waitFor(() => {
      expect(
        fetchStub.requests.filter(
          (request) => request.method === 'PUT' && request.url.includes('/api/devices/'),
        ),
      ).toHaveLength(1);
    });
  });

  it('signs out after a confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithProviders(<SettingsScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(useSessionStore.getState().status).toBe('signedIn');
    const buttons = alert.mock.calls[0]![2]!;
    await act(() => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });
    // Busy while the sign-out runs: no second tap.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeBusy();
    await waitFor(() => {
      expect(useSessionStore.getState()).toEqual({
        status: 'signedOut',
        endedBy: 'user',
        user: null,
      });
    });
  });
});

describe('OnboardingScreen', () => {
  it('completes onboarding once the user continues', async () => {
    await renderWithProviders(<OnboardingScreen />);
    expect(screen.getByRole('header', { name: 'Welcome' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(usePreferences.getState().onboardingCompleted).toBe(true);
  });
});
