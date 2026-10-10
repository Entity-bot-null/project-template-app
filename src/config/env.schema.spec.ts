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
});
