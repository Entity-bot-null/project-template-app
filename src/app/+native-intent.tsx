import { toInternalPath } from '@/lib/links';

/**
 * Every link that opens the app passes here first (custom scheme, universal
 * links, App Links): only the routes of src/lib/links.ts get through, the
 * rest opens the home screen. Must never throw.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return toInternalPath(path) ?? '/';
  } catch {
    return '/';
  }
}
