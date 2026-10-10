// Links from outside the app: the custom scheme (templateapp://items/42),
// universal links / App Links (https://<domain>/items/42) and notification
// payloads (docs/MOBILE_ARCHITECTURE.md#deep-links). They are untrusted input:
// anyone can craft one. Only the paths below are accepted, with their
// parameters validated; query strings are dropped (no arbitrary parameters
// reach a screen); anything else opens the home screen. A link never
// performs an action by itself (no sign-in, payment or deletion from a URL):
// it opens a screen where the user decides.

interface LinkRoute {
  pattern: RegExp;
  toPath: (match: RegExpExecArray) => string;
}

const ID = '([A-Za-z0-9_-]{1,64})';

const ROUTES: readonly LinkRoute[] = [
  { pattern: /^\/$/, toPath: () => '/' },
  { pattern: /^\/items$/, toPath: () => '/' },
  { pattern: new RegExp(`^/items/${ID}$`), toPath: (match) => `/items/${match[1] ?? ''}` },
  { pattern: /^\/settings$/, toPath: () => '/settings' },
];

/**
 * The internal route for an incoming link or path, or null when the app
 * does not accept it. `scheme://a/b` reads as `/a/b`; for http(s) links the
 * host is dropped (the operating system only hands the app links of its
 * verified domain).
 */
export function toInternalPath(link: string): string | null {
  let path = link.trim();
  const withScheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(path);
  if (withScheme) {
    const protocol = (withScheme[1] ?? '').toLowerCase();
    const rest = withScheme[2] ?? '';
    path = protocol === 'https' || protocol === 'http' ? rest.replace(/^[^/?#]*/, '') : `/${rest}`;
  }
  path = (path.split(/[?#]/, 1)[0] ?? '').replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/$/, '');

  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return route.toPath(match);
  }
  return null;
}
