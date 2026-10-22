// Tests of the routes of apps/landing/nginx/default.conf.template against the
// apps they serve (`node --test scripts/web-server-routes.test.mjs`): a
// language of the landing, or a screen the API's emails link to, added on one
// side only would answer 404 in production, or open the browser instead of
// the app, while every other test passes.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/** @param {string} path from the repository root */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
/** @param {string} path from the repository root */
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const nginx = read('apps/landing/nginx/default.conf.template');

/** The landing's languages (apps/landing/src/i18n/locales.ts): the default one, then the others. */
function landingLanguages() {
  const source = read('apps/landing/src/i18n/locales.ts');
  const list = /export const LOCALES = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  const all = [...list.matchAll(/'([a-z]{2,3}(?:-[A-Za-z]{2,4})?)'/g)].map((match) => match[1]);
  const fallback = /export const DEFAULT_LOCALE: Locale = '([^']+)'/.exec(source)?.[1];
  assert.ok(fallback !== undefined && all.includes(fallback), 'DEFAULT_LOCALE is one of LOCALES');
  return { fallback, others: all.filter((code) => code !== fallback) };
}

test('an unknown address is answered with the not-found page of its language', () => {
  const { others } = landingLanguages();
  const map = /map \$uri \$landing_not_found \{([^}]*)\}/.exec(nginx)?.[1] ?? '';
  assert.match(map, /^\s*default \/404\.html;$/m);
  const entries = [...map.matchAll(/^\s*~\^\/([^/]+)\/ (\S+);$/gm)].map(([, code, page]) => [
    code,
    page,
  ]);
  assert.deepEqual(
    entries,
    others.map((code) => [code, `/${code}/404/index.html`]),
    'one map line per language of the landing besides the default',
  );
});

test('every language of the landing has each of its pages', () => {
  const { others } = landingLanguages();
  const pages = ['index', '404', 'open-in-app', 'privacy', 'delete-account'];
  for (const page of pages) assert.ok(exists(`apps/landing/src/pages/${page}.astro`), page);
  for (const code of others) {
    for (const page of pages) {
      assert.ok(exists(`apps/landing/src/pages/${code}/${page}.astro`), `${code}/${page}.astro`);
    }
  }
});

test('the app links are answered with the open-in-app page, at their own address', () => {
  for (const location of ['location = /app {', 'location ^~ /app/ {']) {
    const start = nginx.indexOf(location);
    assert.ok(start !== -1, location);
    // The block ends at its closing brace, on its own line at the server's indent.
    const block = nginx.slice(start, nginx.indexOf('\n    }', start));
    assert.match(block, /try_files \/open-in-app\/index\.html =404;/, location);
    // No redirect: the link's token rides in the fragment of this address.
    assert.doesNotMatch(block, /return 30[12]/, location);
    assert.match(block, /X-Robots-Tag "noindex"/, location);
  }
});

test("the screens the API's emails link to are links the app accepts", () => {
  const linked = new Set();
  const templates = 'apps/api/src/infrastructure/mail/templates';
  for (const file of readdirSync(new URL(`../${templates}`, import.meta.url))) {
    if (!file.endsWith('.template.ts')) continue;
    for (const [, screen] of read(`${templates}/${file}`).matchAll(/\$\{appUrl\}\/([a-z-]+)/g)) {
      linked.add(screen);
    }
  }
  assert.ok(linked.size > 0, 'the emails link to screens of the app');
  const links = read('apps/mobile/src/lib/links.ts');
  const list = /export const LINK_TOKEN_SCREENS = \[([^\]]*)\]/.exec(links)?.[1] ?? '';
  const tokenScreens = [...list.matchAll(/'([a-z-]+)'/g)].map(([, screen]) => screen);
  // A screen with a token, or a route of its own without one (sign-in).
  for (const screen of linked) {
    assert.ok(
      tokenScreens.includes(screen) || links.includes(`pattern: /^\\/${screen}$/`),
      `the app does not accept the emailed link /app/${screen}`,
    );
  }
  // And every screen that reads a token is one an email links to.
  for (const screen of tokenScreens) assert.ok(linked.has(screen), `no email links to ${screen}`);
});
