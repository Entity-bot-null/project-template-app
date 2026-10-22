import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

import { useSessionStore } from '@/auth/session';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { account } from '@/test/fixtures';
import { ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

import { SettingsScreen } from './SettingsScreen';

let fetchStub: StubbedFetch;

beforeEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  fetchStub = stubFetch({ 'GET /api/users/me': () => ok(account) });
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

  it('signs out after a confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithProviders(<SettingsScreen />);
    await userEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(useSessionStore.getState().status).toBe('signedIn');
    const buttons = alert.mock.calls[0]![2]!;
    buttons.find((button) => button.style === 'destructive')?.onPress?.();
    await waitFor(() => {
      expect(useSessionStore.getState()).toEqual({ status: 'signedOut', endedBy: 'user' });
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
