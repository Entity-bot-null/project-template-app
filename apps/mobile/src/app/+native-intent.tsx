import { linkTokens } from '@/auth/linkTokens';
import { parseLink } from '@/lib/links';

/**
 * Every link that opens the app passes here first (custom scheme, universal
 * links, App Links): only the routes of src/lib/links.ts get through, the
 * rest opens the home screen. The one-time token of an emailed link is kept
 * in memory (src/auth/linkTokens.ts) before navigating: the internal path
 * never carries it. Must never throw.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const link = parseLink(path);
    if (link === null) return '/';
    if (link.token !== null) linkTokens.keep(link.token.screen, link.token.value);
    return link.path;
  } catch {
    return '/';
  }
}
