// Test setup (jest.config.js setupFilesAfterEnv). Native modules the app uses
// are replaced by in-memory versions with real behavior (values written can
// be read back), so tests exercise the app's logic instead of mocks of it.
import '@testing-library/react-native/matchers';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
    __reset: () => {
      values.clear();
    },
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
    getItemSync: jest.fn((key: string) => values.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItemSync: jest.fn((key: string) => {
      values.delete(key);
    }),
    __reset: () => {
      values.clear();
    },
  };
  return { __esModule: true, default: storage };
});

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  ),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, canAskAgain: true, status: 'undetermined' }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, canAskAgain: true, status: 'granted' }),
  ),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ type: 'expo', data: 'expo-token' })),
  getDevicePushTokenAsync: jest.fn(() =>
    Promise.resolve({ type: 'android', data: 'device-token' }),
  ),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-updates', () => ({
  updateId: null,
  channel: null,
  runtimeVersion: null,
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((callback: (scope: unknown) => void) => {
    callback({ setLevel: jest.fn(), setTags: jest.fn() });
  }),
}));

beforeEach(() => {
  jest.requireMock<{ __reset(): void }>('expo-secure-store').__reset();
  jest.requireMock<{ default: { __reset(): void } }>('expo-sqlite/kv-store').default.__reset();
});
