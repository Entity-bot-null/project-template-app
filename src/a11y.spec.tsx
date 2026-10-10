import { screen, userEvent } from '@testing-library/react-native';
import { Pressable, View } from 'react-native';

import { ItemDetailScreen } from '@/features/items/ItemDetailScreen';
import { ItemsScreen } from '@/features/items/ItemsScreen';
import { NewItemScreen } from '@/features/items/NewItemScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { inaccessibleControls } from '@/test/a11y';
import { item, page, user } from '@/test/fixtures';
import { ok, stubFetch, type StubbedFetch } from '@/test/http';
import { renderWithProviders } from '@/test/render';
import { endTestSession, signInForTest } from '@/test/session';

// The automated part of the accessibility gate over every screen of the
// template (docs/ACCESSIBILITY.md#automated-checks). Add each new screen here.

jest.mock('expo-router', () => ({
  ...jest.requireActual<object>('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
}));

let fetchStub: StubbedFetch;

beforeEach(async () => {
  fetchStub = stubFetch({
    'GET /api/users/me': () => ok(user),
    'GET /api/items': () => ok(page(0, 3, 3)),
    'GET /api/items/:id': () => ok(item(1)),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

describe('every control can be used with a screen reader', () => {
  it('onboarding', async () => {
    await renderWithProviders(<OnboardingScreen />);
    expect(inaccessibleControls()).toEqual([]);
  });

  it('sign-in, also with its validation errors', async () => {
    await renderWithProviders(<SignInScreen />);
    expect(inaccessibleControls()).toEqual([]);
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter your password');
    expect(inaccessibleControls()).toEqual([]);
  });

  it('the item list, detail and form', async () => {
    await renderWithProviders(<ItemsScreen />);
    await screen.findByText('Item 0');
    expect(inaccessibleControls()).toEqual([]);
    await screen.rerender(<ItemDetailScreen id="item-1" />);
    await screen.findByText('Item 1');
    expect(inaccessibleControls()).toEqual([]);
    await screen.rerender(<NewItemScreen />);
    expect(inaccessibleControls()).toEqual([]);
  });

  it('settings', async () => {
    await renderWithProviders(<SettingsScreen />);
    await screen.findByText(user.email);
    expect(inaccessibleControls()).toEqual([]);
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
