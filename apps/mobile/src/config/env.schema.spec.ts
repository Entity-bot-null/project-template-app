import { parsePublicEnv } from './env.schema';

const base = { EXPO_PUBLIC_API_URL: 'https://api.example.com' };

describe('parsePublicEnv', () => {
  it('applies the defaults: development, reporting and tracing off', () => {
    expect(parsePublicEnv(base)).toEqual({
      EXPO_PUBLIC_APP_ENV: 'development',
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0,
    });
  });

  it('requires the API URL, without a trailing slash', () => {
    expect(() => parsePublicEnv({})).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() => parsePublicEnv({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' })).toThrow(
      /no trailing slash/,
    );
  });

  it('allows plain HTTP for the local mock API only', () => {
    for (const host of ['localhost:4010', '127.0.0.1:4010', '10.0.2.2:4010']) {
      expect(() => parsePublicEnv({ EXPO_PUBLIC_API_URL: `http://${host}` })).not.toThrow();
    }
    expect(() => parsePublicEnv({ EXPO_PUBLIC_API_URL: 'http://api.example.com' })).toThrow(
      /must use https/,
    );
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_API_URL: 'http://localhost',
      }),
    ).toThrow(/https in production/);
  });

  it("takes the app's store pages as https links to each store, both optional", () => {
    const parsed = parsePublicEnv({
      ...base,
      EXPO_PUBLIC_STORE_URL_IOS: 'https://apps.apple.com/app/id123456789',
      EXPO_PUBLIC_STORE_URL_ANDROID: 'https://play.google.com/store/apps/details?id=com.acme.app',
    });
    expect(parsed.EXPO_PUBLIC_STORE_URL_IOS).toBe('https://apps.apple.com/app/id123456789');
    expect(
      parsePublicEnv({ ...base, EXPO_PUBLIC_STORE_URL_IOS: '' }).EXPO_PUBLIC_STORE_URL_IOS,
    ).toBe(undefined);
    expect(() =>
      parsePublicEnv({ ...base, EXPO_PUBLIC_STORE_URL_IOS: 'https://play.google.com/x' }),
    ).toThrow(/EXPO_PUBLIC_STORE_URL_IOS: must be an https:\/\/apps\.apple\.com\/ link/);
    expect(() =>
      parsePublicEnv({ ...base, EXPO_PUBLIC_STORE_URL_ANDROID: 'http://play.google.com/x' }),
    ).toThrow(/EXPO_PUBLIC_STORE_URL_ANDROID/);
  });

  it('checks the Sentry DSN shape and the sample rate', () => {
    expect(
      parsePublicEnv({
        ...base,
        EXPO_PUBLIC_SENTRY_DSN: 'https://abc@o1.ingest.example.com/42',
        EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.2',
      }),
    ).toMatchObject({ EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0.2 });
    expect(() => parsePublicEnv({ ...base, EXPO_PUBLIC_SENTRY_DSN: 'public-key' })).toThrow(
      /EXPO_PUBLIC_SENTRY_DSN/,
    );
    expect(() => parsePublicEnv({ ...base, EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '2' })).toThrow(
      /SAMPLE_RATE/,
    );
    expect(
      parsePublicEnv({ ...base, EXPO_PUBLIC_SENTRY_DSN: '' }).EXPO_PUBLIC_SENTRY_DSN,
    ).toBeUndefined();
  });

  it('checks flag overrides and the environment name, naming every problem', () => {
    expect(() => parsePublicEnv({ ...base, EXPO_PUBLIC_FLAGS: 'newItemForm=yes' })).toThrow(
      /EXPO_PUBLIC_FLAGS/,
    );
    expect(() =>
      parsePublicEnv({ EXPO_PUBLIC_APP_ENV: 'prod', EXPO_PUBLIC_API_URL: 'nope' }),
    ).toThrow(/EXPO_PUBLIC_APP_ENV[\s\S]*EXPO_PUBLIC_API_URL/);
  });

  it('takes flag overrides in development and staging builds only', () => {
    for (const environment of ['development', 'staging']) {
      expect(
        parsePublicEnv({
          ...base,
          EXPO_PUBLIC_APP_ENV: environment,
          EXPO_PUBLIC_FLAGS: 'newItemForm=false',
        }).EXPO_PUBLIC_FLAGS,
      ).toBe('newItemForm=false');
    }
    expect(() =>
      parsePublicEnv({
        ...base,
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_FLAGS: 'newItemForm=false',
      }),
    ).toThrow(/EXPO_PUBLIC_FLAGS: development and staging builds only/);
    // An empty value is unset (EAS and .env files), so production accepts it.
    expect(() =>
      parsePublicEnv({ ...base, EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_FLAGS: '' }),
    ).not.toThrow();
  });
});
