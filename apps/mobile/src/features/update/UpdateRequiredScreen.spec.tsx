import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderWithProviders } from '@/test/render';

import { UpdateRequiredScreen } from './UpdateRequiredScreen';

// The store page, when it is configured (EXPO_PUBLIC_STORE_URL_*): the
// default test environment has none (src/a11y.spec.tsx covers that screen).

const STORE_URL = 'https://play.google.com/store/apps/details?id=com.example.templateapp';

jest.mock('@/config/env', () => ({
  env: {
    ...jest.requireActual<{ env: object }>('@/config/env').env,
    EXPO_PUBLIC_STORE_URL_ANDROID:
      'https://play.google.com/store/apps/details?id=com.example.templateapp',
    EXPO_PUBLIC_STORE_URL_IOS: 'https://apps.apple.com/app/id000000000',
  },
}));

describe('UpdateRequiredScreen', () => {
  function renderScreen() {
    return renderWithProviders(<UpdateRequiredScreen />);
  }

  it('opens the app’s page in the store', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen();
    expect(screen.getByText(/no longer supported\. Update it to continue\./)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: /^Update from / }));
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/(play\.google\.com|apps\.apple\.com)\//),
    );
    expect([STORE_URL, 'https://apps.apple.com/app/id000000000']).toContain(open.mock.calls[0]![0]);
  });

  it('says so in the logs when the store cannot be opened, never crashing', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No activity found'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderScreen();
    await userEvent.press(screen.getByRole('button', { name: /^Update from / }));
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[app] Store page could not be opened', expect.anything());
    });
  });
});
