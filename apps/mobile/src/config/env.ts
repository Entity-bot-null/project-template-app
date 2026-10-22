import type { z } from 'zod';

import { parsePublicEnv, type PublicEnvSchema } from './env.schema';

// The only module that reads process.env (an ESLint rule enforces it). Expo
// inlines EXPO_PUBLIC_* values only when each one is referenced statically,
// as process.env.EXPO_PUBLIC_NAME: keep one line per variable. The type
// below lists every variable of the schema, so a new one without its line
// here fails `pnpm typecheck` instead of being undefined in the app.
const source = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  EXPO_PUBLIC_STORE_URL_IOS: process.env.EXPO_PUBLIC_STORE_URL_IOS,
  EXPO_PUBLIC_STORE_URL_ANDROID: process.env.EXPO_PUBLIC_STORE_URL_ANDROID,
  EXPO_PUBLIC_FLAGS: process.env.EXPO_PUBLIC_FLAGS,
} satisfies Record<keyof z.input<typeof PublicEnvSchema>, string | undefined>;

export const env = parsePublicEnv(source);
