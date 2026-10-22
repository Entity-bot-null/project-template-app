import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCALES, messages, type Locale } from '../i18n';
import { PRIVACY_EMAIL } from '../lib/site';
import DeleteAccount from './DeleteAccount.astro';
import Home from './Home.astro';
import NotFound from './NotFound.astro';
import OpenInApp from './OpenInApp.astro';
import Privacy from './Privacy.astro';

// The pages as the build renders them, for a site at https://example.com.
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create({ astroConfig: { site: 'https://example.com' } });
});

const render = (component: typeof Home, locale: Locale) =>
  container.renderToString(component, { props: { locale } });

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

/** The address of a page in one language, absolute. */
const at = (locale: Locale, path: string) =>
  `https://example.com${locale === 'en' ? '' : `/${locale}`}${path}`;

describe.each(LOCALES)('the home page in %s', (locale) => {
  const t = messages(locale);
  const home = locale === 'en' ? '/' : `/${locale}/`;

  it('is written in its language, with one main heading', async () => {
    const html = await render(Home, locale);
    expect(html).toContain(`<html lang="${locale}">`);
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toContain(t.home.heading[0]);
    expect(html).toContain(t.home.lead);
  });

  it('tells search engines its address and its twin in every language', async () => {
    const html = await render(Home, locale);
    expect(html).toContain(`<link rel="canonical" href="${at(locale, '/')}">`);
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://example.com/">');
    expect(html).toContain('<link rel="alternate" hreflang="es" href="https://example.com/es/">');
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://example.com/">',
    );
    expect(html).not.toContain('noindex');
  });

  it('marks its language as the current one and leads to the download', async () => {
    const html = await render(Home, locale);
    expect(html).toContain(`hreflang="${locale}" lang="${locale}" aria-current="true"`);
    expect(html).toContain('id="download"');
    expect(html.split(`href="${home}#download"`).length - 1).toBeGreaterThanOrEqual(3);
    // No store listing yet (lib/stores.ts): no badge leads anywhere.
    expect(html).toContain(t.download.soon);
    expect(html).not.toContain('data-store=');
  });

  it('links to its privacy and account deletion pages in its language', async () => {
    const html = await render(Home, locale);
    expect(html).toContain(`href="${home}privacy/"`);
    expect(html).toContain(`href="${home}delete-account/"`);
  });

  it('shows its picture when shared, described in its language', async () => {
    const html = await render(Home, locale);
    expect(html).toContain('<meta property="og:image" content="https://example.com/og.png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain(`<meta property="og:image:alt" content="${t.shareImageAlt}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('describes the picture of the app in its language', async () => {
    const html = await render(Home, locale);
    expect(count(html, /data-ui role="img"/g)).toBe(1);
    expect(html).toContain(`aria-label="${t.home.phone}"`);
  });

  it('ships no script: the pages are HTML and CSS', async () => {
    const html = await render(Home, locale);
    expect(html).not.toMatch(/<script\b/);
  });
});

describe.each(LOCALES)('the not-found page in %s', (locale) => {
  it('stays out of search results and leads home in its language', async () => {
    const html = await render(NotFound, locale);
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain(messages(locale).notFound.action);
    expect(html).toContain(`href="${locale === 'en' ? '/' : `/${locale}/`}" class="button`);
  });
});

describe.each(LOCALES)('the open-in-app page in %s', (locale) => {
  const t = messages(locale);

  it('explains how to open the link in the app, out of search results', async () => {
    const html = await render(OpenInApp, locale);
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(count(html, /<h1\b/g)).toBe(1);
    for (const step of t.openInApp.steps) expect(html).toContain(step);
    expect(html).toContain(t.download.soon);
  });

  it('offers the page in the other language', async () => {
    const html = await render(OpenInApp, locale);
    expect(html).toContain('href="/es/open-in-app/"');
    expect(html).toContain('href="/open-in-app/"');
  });
});

describe.each(LOCALES)('the privacy page in %s', (locale) => {
  const t = messages(locale).privacy;

  it('is indexed under its address, with every section of the inventory', async () => {
    const html = await render(Privacy, locale);
    expect(html).toContain(`<link rel="canonical" href="${at(locale, '/privacy/')}">`);
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(count(html, /<h2\b/g)).toBe(t.sections.length);
    for (const { heading } of t.sections) expect(html).toContain(heading);
    expect(html).toContain(PRIVACY_EMAIL);
  });

  it('says it is a template until the project writes its legal text', async () => {
    expect(await render(Privacy, locale)).toContain(t.templateNotice);
  });
});

describe.each(LOCALES)('the account deletion page in %s', (locale) => {
  const t = messages(locale).deleteAccount;

  it('is indexed under its address, the one Google Play asks for', async () => {
    const html = await render(DeleteAccount, locale);
    expect(html).toContain(`<link rel="canonical" href="${at(locale, '/delete-account/')}">`);
    expect(html).not.toContain('noindex');
  });

  it('explains the deletion from the app and by email', async () => {
    const html = await render(DeleteAccount, locale);
    for (const step of t.inApp.steps) expect(html).toContain(step);
    expect(html).toContain(
      `href="mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(t.byEmail.subject)}"`,
    );
    expect(html).toContain(t.deleted.heading);
    expect(html).toContain(t.kept.heading);
  });
});
