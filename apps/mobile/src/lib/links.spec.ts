import { APP_LINK_PATHS, toInternalPath } from './links';

describe('toInternalPath', () => {
  it.each([
    ['templateapp://items/42', '/items/42'],
    ['templateapp-dev://items/abc_DEF-9', '/items/abc_DEF-9'],
    ['https://app.example.com/items/42?utm_source=mail#top', '/items/42'],
    ['/items/42/', '/items/42'],
    ['items/42', '/items/42'],
    ['templateapp://settings', '/settings'],
    ['templateapp://items', '/'],
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
  ])('refuses %s', (_name, link) => {
    expect(toInternalPath(link)).toBeNull();
  });

  it('drops query parameters instead of passing them to screens', () => {
    expect(toInternalPath('templateapp://items/7?admin=true&token=abc')).toBe('/items/7');
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

  it.each(['/', '/items', '/items/42', '/items/abc_DEF-9', '/settings'])(
    'opens the app for %s, a path the allowlist accepts',
    (path) => {
      expect(toInternalPath(`${DOMAIN}${path}`)).not.toBeNull();
      expect(opensApp(path)).toBe(true);
    },
  );

  it.each(['/admin', '/item', '/itemsx', '/settingsx', '/settings/delete', '/privacy'])(
    'leaves %s to the browser, a path the allowlist refuses',
    (path) => {
      expect(toInternalPath(`${DOMAIN}${path}`)).toBeNull();
      expect(opensApp(path)).toBe(false);
    },
  );

  it('declares only paths the allowlist accepts', () => {
    for (const entry of APP_LINK_PATHS) {
      // A prefix stands for a parameter: any valid value must be accepted.
      const path = 'path' in entry ? entry.path : `${entry.pathPrefix}item-1`;
      expect(toInternalPath(`${DOMAIN}${path}`)).not.toBeNull();
    }
  });

  it('cannot check an id format on Android: the allowlist sends a bad one home', () => {
    // Android's path matching has no character classes, so /items/<anything>
    // opens the app; the allowlist then refuses it and the app opens home.
    expect(opensApp('/items/42/delete')).toBe(true);
    expect(toInternalPath(`${DOMAIN}/items/42/delete`)).toBeNull();
  });
});
