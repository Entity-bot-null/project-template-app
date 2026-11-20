import { defineConfig, devices } from '@playwright/test';
import { LANDING_URL } from './support/landing.js';
import {
  TEST_APP_IDENTITY,
  WEB_IMAGE_PORT,
  WEB_IMAGE_RELEASE,
  WEB_IMAGE_URL,
} from './support/web-image.js';

// The browser suite (e2e/*.e2e.ts, next to this file; `pnpm test:e2e` passes
// --config): a real browser against the public site.
//   - landing: the built landing (apps/landing), on its preview server;
//   - app-links: the web image itself (apps/landing/Dockerfile), for what
//     only its web server does: the open-in-app page at the app's links and
//     the files that let the phones claim them.
// Needs `pnpm build`, Docker, and the browser once:
// `pnpm exec playwright install chromium`. The app itself is tested by Jest
// and Maestro (docs/testing.md).
const CI = process.env.CI !== undefined;
// The servers start from the repository root, as the commands below expect.
// The results (test-results/) and the HTML report (playwright-report/) are
// written next to the root package.json: Playwright's default, unchanged.
const ROOT = '..';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'landing',
      testMatch: 'landing.e2e.ts',
      use: { ...devices['Desktop Chrome'], baseURL: LANDING_URL },
    },
    {
      name: 'app-links',
      testMatch: 'app-links.e2e.ts',
      use: { ...devices['Pixel 7'], baseURL: WEB_IMAGE_URL },
    },
  ],
  webServer: [
    {
      // The built landing: static pages, built for this address.
      command: 'pnpm --filter landing preview',
      cwd: ROOT,
      url: LANDING_URL,
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      // Built on the first run (a few minutes), from Docker's cache after.
      command: 'node scripts/e2e-web-image.mjs',
      cwd: ROOT,
      env: {
        WEB_IMAGE_PORT: String(WEB_IMAGE_PORT),
        WEB_IMAGE_RELEASE,
        ...TEST_APP_IDENTITY,
      },
      url: `${WEB_IMAGE_URL}/healthz`,
      timeout: 600_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
});
