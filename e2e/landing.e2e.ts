import { expect, test } from '@playwright/test';
import { LANDING_URL } from './support/landing.js';

// The public site, as built: both languages, what visitors and search engines
// follow, and the way to the app's download. The landing is static pages; how
// the web image serves them next to the app's links and the API is the other
// spec's (app-links.e2e.ts) and the smoke test's (scripts/smoke-test.mjs).

test('the home page says what this is and leads to the download', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Template App · Your product, in your pocket');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your product, in your pocket.');
  const hero = page.getByRole('region', { name: 'Your product, in your pocket.' });
  await expect(hero.getByRole('img', { name: /The app on a phone/ })).toBeVisible();
  await hero.getByRole('link', { name: 'Get the app' }).click();
  await expect(page).toHaveURL(`${LANDING_URL}/#download`);
  await expect(page.getByRole('heading', { name: 'Get the app', level: 2 })).toBeInViewport();
  // No store listing yet: a sentence instead of badges that lead nowhere.
  await expect(page.getByText('Coming soon to the App Store and Google Play.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What it does' })).toBeVisible();
});

test('a visitor reads the site in Spanish and comes back to English', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Español' })
    .click();
  await expect(page).toHaveURL(`${LANDING_URL}/es/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu producto, en el bolsillo.');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'English' })
    .click();
  await expect(page).toHaveURL(`${LANDING_URL}/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the footer leads to the privacy and account deletion pages', async ({ page }) => {
  await page.goto('/');
  const product = page.getByRole('navigation', { name: 'Product' });
  await product.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(`${LANDING_URL}/privacy/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  await expect(page.getByText(/This page is a template/)).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Product' })
    .getByRole('link', { name: 'Delete your account' })
    .click();
  await expect(page).toHaveURL(`${LANDING_URL}/delete-account/`);
  await expect(page.getByRole('heading', { name: 'From the app' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'privacy@example.com' })).toHaveAttribute(
    'href',
    'mailto:privacy@example.com?subject=Delete%20my%20account',
  );
});

test('the first key press offers to skip to the content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${LANDING_URL}/#content`);
});

test('an unknown address answers 404, kept out of search results, with a way home', async ({
  page,
}) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing lives here.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute(
    'href',
    '/',
  );
});

test('robots.txt and the sitemap give search engines the public pages in both languages', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /app/');
  expect(robots).toContain(`Sitemap: ${LANDING_URL}/sitemap-index.xml`);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  for (const path of ['/', '/privacy/', '/delete-account/']) {
    expect(sitemap).toContain(`<loc>${LANDING_URL}${path}</loc>`);
    expect(sitemap).toContain(`<loc>${LANDING_URL}/es${path}</loc>`);
  }
  expect(sitemap).not.toContain('404');
  expect(sitemap).not.toContain('open-in-app');
});
