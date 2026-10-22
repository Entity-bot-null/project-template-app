import { APP_LINK_PATHS, LINK_TOKEN_SCREENS, parseLink, toInternalPath } from './links';

const TOKEN = 'Ab3_-9'.repeat(8).slice(0, 43);

describe('toInternalPath', () => {
  it.each([
    ['templateapp://items/42', '/items/42'],
    ['templateapp-dev://items/abc_DEF-9', '/items/abc_DEF-9'],
    ['https://app.example.com/app/items/42?utm_source=mail#top', '/items/42'],
    ['https://app.example.com/app', '/'],
    ['https://app.example.com/app/', '/'],
    ['https://app.example.com//app//settings/', '/settings'],
    ['/items/42/', '/items/42'],
    ['items/42', '/items/42'],
    ['templateapp://settings', '/settings'],
    ['templateapp://items', '/'],
    ['templateapp://sign-in', '/sign-in'],
    ['https://app.example.com/app/forgot-password', '/forgot-password'],
    ['templateapp://', '/'],
    ['/', '/'],
  ])('accepts %s as %s', (link, path) => {
    expect(toInternalPath(link)).toBe(path);
  });

  it.each([
    ['an unknown route', 'templateapp://admin/delete-everything'],
    ['an id with forbidden characters', 'templateapp://items/..%2F..%2Fsecret'],
    ['a path traversal', '/items/../settings'],
    ['an over-long id', `/items/${'a'.repeat(65)}`],
    ['nested paths', '/items/42/delete'],
    ['an https link outside the app prefix (the website)', 'https://app.example.com/items/42'],
    ['an https link to a path that only starts like the prefix', 'https://app.example.com/apps'],
    ['the prefix twice', 'https://app.example.com/app/app/items/42'],
  ])('refuses %s', (_name, link) => {
    expect(toInternalPath(link)).toBeNull();
  });

  it('drops query parameters instead of passing them to screens', () => {
    expect(toInternalPath('templateapp://items/7?admin=true&token=abc')).toBe('/items/7');
  });
});

describe('parseLink: the token of an emailed link', () => {
  it.each(LINK_TOKEN_SCREENS)('reads it from the fragment for %s, out of the path', (screen) => {
    expect(parseLink(`https://app.example.com/app/${screen}#token=${TOKEN}`)).toEqual({
      path: `/${screen}`,
      token: { screen, value: TOKEN },
    });
    expect(parseLink(`templateapp-e2e://${screen}#token=${TOKEN}`)).toEqual({
      path: `/${screen}`,
      token: { screen, value: TOKEN },
    });
  });

  it.each([
    ['too short', `#token=${TOKEN.slice(1)}`],
    ['too long', `#token=${TOKEN}A`],
    ['outside base64url', `#token=${TOKEN.slice(1)}+`],
    ['padded', `#token=${TOKEN.slice(2)}==`],
    ['among other parameters', `#token=${TOKEN}&next=/admin`],
    ['under another name', `#t=${TOKEN}`],
    ['in the query string instead (it would reach the server)', `?token=${TOKEN}`],
    ['missing', ''],
  ])('opens the screen without a token when it is %s', (_name, suffix) => {
    expect(parseLink(`https://app.example.com/app/reset-password${suffix}`)).toEqual({
      path: '/reset-password',
      token: null,
    });
  });

  it('never reads a token for any other screen', () => {
    expect(parseLink(`templateapp://items/42#token=${TOKEN}`)).toEqual({
      path: '/items/42',
      token: null,
    });
    expect(parseLink(`templateapp://sign-in#token=${TOKEN}`)).toEqual({
      path: '/sign-in',
      token: null,
    });
  });

  it('refuses a link that is not the app’s, token or not', () => {
    expect(parseLink(`https://app.example.com/reset-password#token=${TOKEN}`)).toBeNull();
  });
});

// app.config.ts declares APP_LINK_PATHS as the Android App Links intent
// filter: the https paths Android opens in the app instead of the browser.
// They must be the paths the allowlist accepts, or a link opens the browser
// although the app handles it, or opens the app only to land on the home
// screen.
describe('APP_LINK_PATHS', () => {
  const DOMAIN = 'https://app.example.com';

  /** How Android matches a <data> element's path: exactly, or by prefix. */
  function opensApp(path: string): boolean {
    return APP_LINK_PATHS.some((entry) =>
      'path' in entry ? entry.path === path : path.startsWith(entry.pathPrefix),
    );
  }

  it.each([
    '/app',
    '/app/items',
    '/app/items/42',
    '/app/items/abc_DEF-9',
    '/app/settings',
    '/app/sign-in',
    '/app/forgot-password',
    ...LINK_TOKEN_SCREENS.map((screen) => `/app/${screen}`),
  ])('opens the app for %s, a path the allowlist accepts', (path) => {
    expect(toInternalPath(`${DOMAIN}${path}`)).not.toBeNull();
    expect(opensApp(path)).toBe(true);
  });

  it.each([
    '/',
    '/items/42',
    '/reset-password',
    '/app/admin',
    '/app/item',
    '/app/itemsx',
    '/app/settingsx',
    '/app/settings/delete',
    '/privacy',
    '/es/',
  ])('leaves %s to the browser, a path the allowlist refuses', (path) => {
    expect(toInternalPath(`${DOMAIN}${path}`)).toBeNull();
    expect(opensApp(path)).toBe(false);
  });

  it('declares only paths the allowlist accepts', () => {
    for (const entry of APP_LINK_PATHS) {
      // A prefix stands for a parameter: any valid value must be accepted.
      const path = 'path' in entry ? entry.path : `${entry.pathPrefix}item-1`;
      expect(toInternalPath(`${DOMAIN}${path}`)).not.toBeNull();
    }
  });

  it('cannot check an id format on Android: the allowlist sends a bad one home', () => {
    // Android's path matching has no character classes, so /app/items/<anything>
    // opens the app; the allowlist then refuses it and the app opens home.
    expect(opensApp('/app/items/42/delete')).toBe(true);
    expect(toInternalPath(`${DOMAIN}/app/items/42/delete`)).toBeNull();
  });
});
