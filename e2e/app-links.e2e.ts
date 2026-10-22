import { expect, test } from '@playwright/test';
import { TEST_APP_IDENTITY, WEB_IMAGE_URL } from './support/web-image.js';

// What the web image does for the app's links (apps/landing/nginx), on a
// phone's browser: the files that let the phones open /app/* in the app, and
// the open-in-app page where the app does not open them. The image runs with
// a made-up app identity (e2e/support/web-image.ts).

const TOKEN = 'e2eToken_e2eToken-e2eToken_e2eToken-e2eTok';

test("Apple's link file claims the app's links, as JSON, without a redirect", async ({
  request,
}) => {
  const response = await request.get('/.well-known/apple-app-site-association', {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^application\/json/);
  expect(await response.json()).toEqual({
    applinks: {
      details: [
        {
          appIDs: [`${TEST_APP_IDENTITY.APPLE_TEAM_ID}.${TEST_APP_IDENTITY.IOS_BUNDLE_ID}`],
          components: [{ '/': '/app/*', comment: 'The links of the app' }],
        },
      ],
    },
  });
});

test("Google's link file names the app and its signing certificate", async ({ request }) => {
  const response = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^application\/json/);
  expect(await response.json()).toEqual([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: TEST_APP_IDENTITY.ANDROID_PACKAGE,
        sha256_cert_fingerprints: [TEST_APP_IDENTITY.ANDROID_SHA256_CERT_FINGERPRINTS],
      },
    },
  ]);
});

test('nothing else is served under /.well-known/', async ({ request }) => {
  expect((await request.get('/.well-known/security.txt')).status()).toBe(404);
});

test('an emailed link opened without the app explains how to open it, keeping its token', async ({
  page,
}) => {
  const link = `${WEB_IMAGE_URL}/app/reset-password#token=${TOKEN}`;
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  const response = await page.goto(link);

  // No redirect: the page answers at the link's own address, its fragment kept.
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();
  expect(page.url()).toBe(link);
  expect(response?.headers()['x-robots-tag']).toBe('noindex');
  // The token never leaves the phone: no request carries it.
  expect(requested.some((url) => url.includes(TOKEN))).toBe(false);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open it in the app.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByText(/open the link from the email again/)).toBeVisible();
  // Built for a placeholder origin, written with APP_ORIGIN as it is served.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${WEB_IMAGE_URL}/og.png`,
  );
});

test('the open-in-app page reads in Spanish too', async ({ page }) => {
  await page.goto('/app/accept-invitation');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Español' })
    .click();
  await expect(page).toHaveURL(`${WEB_IMAGE_URL}/es/open-in-app/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ábrelo en la aplicación.');
});

test('the landing is served with its security headers and the API errors in its envelope', async ({
  request,
}) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  expect(home.headers()['content-security-policy']).toContain("script-src 'none'");
  expect(await home.text()).not.toContain('public-origin.invalid');
  // No API behind this image in the suite: the web server says so like the API.
  const api = await request.get('/api/items');
  expect(api.status()).toBe(502);
  expect(await api.json()).toEqual({ data: null, message: 'The API could not be reached' });
});
