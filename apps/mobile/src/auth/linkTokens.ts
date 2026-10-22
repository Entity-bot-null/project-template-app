import { useState } from 'react';

import type { LinkTokenScreen } from '@/lib/links';

// The one-time token of a link from an email (src/lib/links.ts): a password
// reset, a sign-up or an email change to confirm, an invitation. It is a
// credential, so it never travels in the internal path, the navigation state,
// analytics or breadcrumbs: src/app/+native-intent.tsx keeps it here, opens
// the screen without it, and the screen takes it. In memory only, one token
// per screen (the newest link wins), taken once, and forgotten after 30
// minutes even if nobody took it.

const TTL_MS = 30 * 60_000;

export interface LinkTokens {
  keep(screen: LinkTokenScreen, token: string): void;
  /** The token kept for this screen, removed as it is taken; null if none or expired. */
  take(screen: LinkTokenScreen): string | null;
}

export function createLinkTokens(now: () => number): LinkTokens {
  const kept = new Map<LinkTokenScreen, { token: string; expiresAt: number }>();
  return {
    keep(screen, token) {
      kept.set(screen, { token, expiresAt: now() + TTL_MS });
    },
    take(screen) {
      const entry = kept.get(screen);
      kept.delete(screen);
      return entry !== undefined && entry.expiresAt > now() ? entry.token : null;
    },
  };
}

export const linkTokens = createLinkTokens(Date.now);

/**
 * The token of the link that opened this screen, taken once when it mounts
 * and kept while it stays: a retry after a refused password reuses it.
 */
export function useLinkToken(screen: LinkTokenScreen): string | null {
  const [token] = useState(() => linkTokens.take(screen));
  return token;
}
