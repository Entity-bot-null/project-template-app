// Where the suite reaches the web image (apps/landing/Dockerfile), which
// playwright.config.ts builds and starts through scripts/e2e-web-image.mjs,
// the release it is built for, and the app identity it runs with, made up for
// the tests (docs/environment.md#web-variables): its link files exist.
export const WEB_IMAGE_PORT = 8091;
export const WEB_IMAGE_URL = `http://localhost:${String(WEB_IMAGE_PORT)}`;
export const WEB_IMAGE_RELEASE = 'e2e';

export const TEST_APP_IDENTITY = {
  APPLE_TEAM_ID: 'ABCDE12345',
  IOS_BUNDLE_ID: 'com.example.templateapp',
  ANDROID_PACKAGE: 'com.example.templateapp',
  ANDROID_SHA256_CERT_FINGERPRINTS: Array.from({ length: 32 }, (_, index) =>
    index.toString(16).toUpperCase().padStart(2, '0'),
  ).join(':'),
} as const;
