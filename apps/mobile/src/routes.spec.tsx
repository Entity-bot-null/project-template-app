import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ErrorBoundary } from '@/app/_layout';
import ItemRoute from '@/app/(app)/items/[id]';
import NotFoundRoute from '@/app/+not-found';
import { redirectSystemPath } from '@/app/+native-intent';
import { linkTokens } from '@/auth/linkTokens';
import {
  disabledReporter,
  type ErrorReporter,
  setErrorReporter,
} from '@/lib/observability/errorReporter';
import { renderWithProviders } from '@/test/render';

// Route files hold no logic of their own; what they do check is tested here.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

describe('routes', () => {
  it('validates the item id from the URL before using it', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../../etc' });
    await renderWithProviders(<ItemRoute />);
    expect(screen.getByText('Item not found')).toBeOnTheScreen();
  });

  it('offers a way home from the not-found screen', async () => {
    await renderWithProviders(<NotFoundRoute />);
    await userEvent.press(screen.getByRole('button', { name: 'Go to the home screen' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('rewrites incoming links through the allowlist, never throwing', () => {
    expect(redirectSystemPath({ path: 'templateapp://items/42', initial: true })).toBe('/items/42');
    expect(redirectSystemPath({ path: 'templateapp://admin', initial: false })).toBe('/');
  });

  it('keeps the token of an emailed link for its screen, out of the internal path', () => {
    const token = 'x'.repeat(43);
    expect(
      redirectSystemPath({
        path: `https://app.example.com/app/accept-invitation#token=${token}`,
        initial: true,
      }),
    ).toBe('/accept-invitation');
    expect(linkTokens.take('accept-invitation')).toBe(token);
    expect(linkTokens.take('accept-invitation')).toBeNull();
  });

  it('opens home instead of throwing on a link it cannot read', () => {
    expect(redirectSystemPath({ path: undefined as unknown as string, initial: true })).toBe('/');
  });

  it('reports a render crash and offers a retry instead of a blank screen', async () => {
    const reporter: jest.Mocked<ErrorReporter> = {
      enabled: true,
      capture: jest.fn(),
      addBreadcrumb: jest.fn(),
      setUser: jest.fn(),
    };
    setErrorReporter(reporter);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('render failed for a@example.com');
    const retry = jest.fn(() => Promise.resolve());
    await renderWithProviders(<ErrorBoundary error={error} retry={retry} />);
    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.queryByText(/render failed/)).toBeNull();
    expect(reporter.capture).toHaveBeenCalledWith(error, {
      level: 'fatal',
      tags: { 'error.kind': 'unknown', boundary: 'root' },
    });
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    setErrorReporter(disabledReporter);
  });
});
