import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, TextInput, View } from 'react-native';

import NotFoundRoute from '@/app/+not-found';
import { useSessionStore } from '@/auth/session';
import { ItemDetailScreen } from '@/features/items/ItemDetailScreen';
import { ItemsScreen } from '@/features/items/ItemsScreen';
import { NewItemScreen } from '@/features/items/NewItemScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { DEFAULT_PREFERENCES, usePreferences } from '@/store/preferences';
import { inaccessibleControls } from '@/test/a11y';
import { contrastProblems } from '@/test/contrast';
import { account, item, page } from '@/test/fixtures';
import { deferred, failure, ok, stubFetch, type StubbedFetch } from '@/test/http';
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

beforeEach(async () => {
  fetchStub = stubFetch({
    'GET /api/users/me': () => ok(account),
    'GET /api/items': () => ok(page(0, 3, 3)),
    'GET /api/items/:id': () => ok(item(1)),
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

  it('settings: loaded, and with the profile failing', async () => {
    const view = await renderWithProviders(<SettingsScreen />);
    await screen.findByText(account.email);
    expectUsable();
    await view.unmount();

    fetchStub.on('GET /api/users/me', () => failure(503, 'Maintenance'));
    await renderWithProviders(<SettingsScreen />);
    await screen.findByRole('button', { name: 'Try again' });
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
