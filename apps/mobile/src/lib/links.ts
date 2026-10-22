// Links from outside the app: the custom scheme (templateapp://items/42),
// universal links / App Links (https://<domain>/app/items/42) and
// notification payloads (docs/mobile-architecture.md#deep-links). They are
// untrusted input: anyone can craft one. Only the paths below are accepted,
// with their parameters validated; query strings are dropped (no arbitrary
// parameters reach a screen); anything else opens the home screen. A link
// never performs an action by itself (no sign-in, payment or deletion from a
// URL): it opens a screen where the user decides.
//
// The links the API emails (a password reset, a sign-up or email change to
// confirm, an invitation) carry a one-time token in the fragment, which never
// reaches a server or its logs: https://<domain>/app/reset-password#token=…
// Only those five screens read it, and only in its exact shape; the token is
// handed to src/auth/linkTokens.ts and never travels in the internal path.

/**
 * A path in an Android App Links intent filter (app.config.ts). Android
 * matches paths exactly or by prefix only, so a route with a parameter is
 * declared by its prefix, and its pattern checks the parameter.
 */
export type AppLinkPath = { path: string } | { pathPrefix: string };

/** The screens opened by a link that carries a one-time token. */
export const LINK_TOKEN_SCREENS = [
  'reset-password',
  'confirm-sign-up',
  'accept-invitation',
  'confirm-email-change',
  'revert-email-change',
] as const;

export type LinkTokenScreen = (typeof LINK_TOKEN_SCREENS)[number];

/**
 * The https links of the app live under this path of the link domain; the
 * rest of the domain is the public website, which the app never claims.
 */
export const APP_LINK_PREFIX = '/app';

interface LinkRoute {
  pattern: RegExp;
  toPath: (match: RegExpExecArray) => string;
  /** The same route as an https link that opens the app on Android, below APP_LINK_PREFIX. */
  appLink: AppLinkPath;
  /** The screen of an emailed link: its fragment may carry a token. */
  tokenScreen?: LinkTokenScreen;
}

const ID = '([A-Za-z0-9_-]{1,64})';

/** A link token as the API mints it: 32 random bytes in base64url. */
const TOKEN_FRAGMENT = /^token=([A-Za-z0-9_-]{43})$/;

const TOKEN_SCREEN_PATTERNS: Record<LinkTokenScreen, RegExp> = {
  'reset-password': /^\/reset-password$/,
  'confirm-sign-up': /^\/confirm-sign-up$/,
  'accept-invitation': /^\/accept-invitation$/,
  'confirm-email-change': /^\/confirm-email-change$/,
  'revert-email-change': /^\/revert-email-change$/,
};

const ROUTES: readonly LinkRoute[] = [
  { pattern: /^\/$/, toPath: () => '/', appLink: { path: '/' } },
  { pattern: /^\/items$/, toPath: () => '/', appLink: { path: '/items' } },
  {
    pattern: new RegExp(`^/items/${ID}$`),
    toPath: (match) => `/items/${match[1] ?? ''}`,
    appLink: { pathPrefix: '/items/' },
  },
  { pattern: /^\/settings$/, toPath: () => '/settings', appLink: { path: '/settings' } },
  { pattern: /^\/sign-in$/, toPath: () => '/sign-in', appLink: { path: '/sign-in' } },
  {
    pattern: /^\/forgot-password$/,
    toPath: () => '/forgot-password',
    appLink: { path: '/forgot-password' },
  },
  ...LINK_TOKEN_SCREENS.map((screen): LinkRoute => ({
    pattern: TOKEN_SCREEN_PATTERNS[screen],
    toPath: () => `/${screen}`,
    appLink: { path: `/${screen}` },
    tokenScreen: screen,
  })),
];

function underPrefix(path: AppLinkPath): AppLinkPath {
  if ('pathPrefix' in path) return { pathPrefix: `${APP_LINK_PREFIX}${path.pathPrefix}` };
  return { path: path.path === '/' ? APP_LINK_PREFIX : `${APP_LINK_PREFIX}${path.path}` };
}

/**
 * The https paths that open the app on Android (the App Links intent filter
 * in app.config.ts): one per route above, below APP_LINK_PREFIX, so the
 * filter follows the allowlist. iOS takes its paths from the domain's
 * apple-app-site-association (/app/*).
 */
export const APP_LINK_PATHS: readonly AppLinkPath[] = ROUTES.map((route) =>
  underPrefix(route.appLink),
);

export interface IncomingLink {
  /** The internal route to open. */
  path: string;
  /** The one-time token of an emailed link, with the screen it is for. */
  token: { screen: LinkTokenScreen; value: string } | null;
}

/**
 * What an incoming link opens, or null when the app does not accept it.
 * `scheme://a/b` reads as `/a/b`; for http(s) links the host is dropped (the
 * operating system only hands the app links of its verified domain) and the
 * path must be below APP_LINK_PREFIX, which is dropped too.
 */
export function parseLink(link: string): IncomingLink | null {
  let path = link.trim();
  let web = false;
  const withScheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(path);
  if (withScheme) {
    const protocol = (withScheme[1] ?? '').toLowerCase();
    const rest = withScheme[2] ?? '';
    web = protocol === 'https' || protocol === 'http';
    path = web ? rest.replace(/^[^/?#]*/, '') : `/${rest}`;
  }
  const hash = path.indexOf('#');
  const fragment = hash === -1 ? '' : path.slice(hash + 1);
  path = (path.split(/[?#]/, 1)[0] ?? '').replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/$/, '');
  if (web) {
    if (path !== APP_LINK_PREFIX && !path.startsWith(`${APP_LINK_PREFIX}/`)) return null;
    path = path.slice(APP_LINK_PREFIX.length) || '/';
  }

  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (!match) continue;
    const token = route.tokenScreen && TOKEN_FRAGMENT.exec(fragment)?.[1];
    return {
      path: route.toPath(match),
      token: route.tokenScreen && token ? { screen: route.tokenScreen, value: token } : null,
    };
  }
  return null;
}

/** The internal route for an incoming link or path, or null when the app does not accept it. */
export function toInternalPath(link: string): string | null {
  return parseLink(link)?.path ?? null;
}
