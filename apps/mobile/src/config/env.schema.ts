import { z } from 'zod';

// The public configuration of the app: EXPO_PUBLIC_* variables, inlined into
// the JavaScript bundle at build time and readable by anyone who has the app.
// Never a secret here (SECURITY.md#secrets). Validated twice with this schema:
// when the app config is evaluated (app.config.ts: a bad value fails the
// build) and when the app starts (env.ts).

export const APP_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

// Hosts a development machine or an emulator reaches the local API on.
// Plain HTTP is accepted for them only; everything else must be HTTPS.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

// An empty value reads as unset (convenient in .env files and EAS).
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const ratio = z.coerce.number().min(0).max(1);

/** An https link to the app's page in one store: its host must be that store's. */
const storeUrl = (host: string) =>
  optional(
    z
      .url({ protocol: /^https$/ })
      .refine((value) => new URL(value).hostname === host, `must be an https://${host}/ link`),
  );

export const PublicEnvSchema = z
  .object({
    EXPO_PUBLIC_APP_ENV: z.enum(APP_ENVIRONMENTS).default('development'),
    // Base URL of the API (scheme and host, optional port and path prefix).
    EXPO_PUBLIC_API_URL: z
      .url({ protocol: /^https?$/ })
      .refine((value) => !value.endsWith('/'), 'no trailing slash'),
    // Sentry DSN of the app's project. Unset: crash and error reporting off.
    EXPO_PUBLIC_SENTRY_DSN: optional(
      z
        .url({ protocol: /^https$/ })
        .regex(
          /^https:\/\/\w+@[\w.-]+(?::\d+)?\/(?:[\w.-]+\/)*\d+$/,
          'must be a Sentry DSN: https://<public key>@<host>/<project id>',
        ),
    ),
    // Share of sessions with performance tracing (0 = off, the default).
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: ratio.default(0),
    // The app's pages in the stores, where the "update required" screen sends
    // the user (src/features/update). Unset: the screen names the store
    // instead of linking to it.
    EXPO_PUBLIC_STORE_URL_IOS: storeUrl('apps.apple.com'),
    EXPO_PUBLIC_STORE_URL_ANDROID: storeUrl('play.google.com'),
    // Feature flag overrides for development and preview (staging) builds:
    // "newItemForm=false,otherFlag=true" (src/lib/flags). Refused below in
    // production, where every flag has its reviewed default.
    EXPO_PUBLIC_FLAGS: optional(
      z
        .string()
        .regex(
          /^[a-zA-Z][\w]*=(true|false)(,[a-zA-Z][\w]*=(true|false))*$/,
          'comma-separated name=true|false pairs',
        ),
    ),
  })
  .superRefine((values, ctx) => {
    const url = new URL(values.EXPO_PUBLIC_API_URL);
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPO_PUBLIC_API_URL'],
        message: 'must use https (plain http only for localhost or the Android emulator host)',
      });
    }
    if (values.EXPO_PUBLIC_APP_ENV === 'production' && url.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPO_PUBLIC_API_URL'],
        message: 'must use https in production',
      });
    }
    if (values.EXPO_PUBLIC_APP_ENV === 'production' && values.EXPO_PUBLIC_FLAGS !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPO_PUBLIC_FLAGS'],
        message: "development and staging builds only (production uses each flag's default)",
      });
    }
  });

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

/** Parses the variables; throws one error naming every invalid variable, never its value. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = PublicEnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
  );
  throw new Error(`Invalid app configuration:\n  ${problems.join('\n  ')}`);
}
