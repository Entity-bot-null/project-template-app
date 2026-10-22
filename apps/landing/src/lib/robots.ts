import { APP_LINKS_PATH } from './links';

/**
 * robots.txt: crawlers read the public pages and find them all in the
 * sitemap; the app's links (one-time tokens) and the API are not for them.
 */
export function robotsTxt(site: URL): string {
  return [
    'User-agent: *',
    `Disallow: ${APP_LINKS_PATH}`,
    'Disallow: /api/',
    '',
    `Sitemap: ${new URL('/sitemap-index.xml', site).href}`,
    '',
  ].join('\n');
}
