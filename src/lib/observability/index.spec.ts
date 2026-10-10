import * as Sentry from '@sentry/react-native';

import type * as Observability from './index';

describe('startObservability', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('stays off without a DSN', () => {
    jest.isolateModules(() => {
      const observability = jest.requireActual<typeof Observability>('./index');
      observability.startObservability();
      expect(observability.errorReporter().enabled).toBe(false);
    });
    expect(jest.mocked(Sentry).init).not.toHaveBeenCalled();
  });

  it('starts Sentry once with the build environment when a DSN is set', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@o1.ingest.example.com/1';
    jest.isolateModules(() => {
      const sentry = jest.requireMock<typeof Sentry>('@sentry/react-native');
      const observability = jest.requireActual<typeof Observability>('./index');
      observability.startObservability();
      observability.startObservability();
      expect(observability.errorReporter().enabled).toBe(true);
      expect(jest.mocked(sentry.init)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(sentry.init)).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'development', tracesSampleRate: 0 }),
      );
    });
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });
});
