import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { recordOutdatedClient } from '../../observability/metrics.js';

/** The platforms the app reports in X-App-Platform. */
export const APP_PLATFORMS = ['ios', 'android'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** The oldest app version served on each platform (MOBILE_MIN_VERSION_*); unset: any. */
export type MinimumAppVersions = Partial<Record<AppPlatform, string>>;

/** Paths every client reaches whatever its version: the probes. */
export const APP_VERSION_EXEMPT_PREFIXES = ['/api/health/'];

export const UPGRADE_REQUIRED =
  'This version of the app is no longer supported: update it to continue';

// The minimum supported app version (docs/adr/0010-minimum-supported-app-version.md).
// An installed app is not updated with the API: when a change would break the
// versions still out there, the operator raises MOBILE_MIN_VERSION_<PLATFORM>
// and those versions get 426, before any other check (authentication, rate
// limits, validation), which the app turns into its "update required" screen.
// Only requests that say they come from the app are checked (X-App-Platform):
// curl, probes and other clients pass. A request from the app without a
// version it can prove (missing or unreadable) is refused once a minimum is
// set. This is a compatibility gate, not a security control: any client can
// send any header.
export function appVersionGate(minimum: MinimumAppVersions): RequestHandler {
  const floors = new Map<AppPlatform, AppVersion>();
  for (const platform of APP_PLATFORMS) {
    const version = minimum[platform];
    if (version === undefined) continue;
    const parsed = parseAppVersion(version);
    // env.schema.ts accepts major.minor.patch only.
    if (parsed === undefined) throw new Error(`Invalid minimum ${platform} version: ${version}`);
    floors.set(platform, parsed);
  }

  return function appVersion(req: Request, res: Response, next: NextFunction): void {
    const platform = platformOf(req.get('X-App-Platform'));
    const floor = platform === undefined ? undefined : floors.get(platform);
    if (
      platform === undefined ||
      floor === undefined ||
      APP_VERSION_EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))
    ) {
      next();
      return;
    }
    const version = parseAppVersion(req.get('X-App-Version') ?? '');
    if (version !== undefined && compareAppVersions(version, floor) >= 0) {
      next();
      return;
    }
    recordOutdatedClient(platform);
    res.status(426).json({ data: null, message: UPGRADE_REQUIRED });
  };
}

function platformOf(header: string | undefined): AppPlatform | undefined {
  const value = header?.trim().toLowerCase();
  return APP_PLATFORMS.find((platform) => platform === value);
}

/** major, minor, patch. */
export type AppVersion = readonly [number, number, number];

/**
 * A version as the stores show it: 1 to 3 numbers ("2", "2.1", "2.1.3", the
 * missing ones 0), with an optional pre-release or build suffix that is
 * ignored ("2.1.3-rc.1", "2.1.3+45"). Anything else: undefined.
 */
export function parseAppVersion(value: string): AppVersion | undefined {
  const match = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+][0-9A-Za-z.-]*)?$/.exec(
    value.trim(),
  );
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Negative, zero or positive as `a` is older than, the same as, or newer than `b`. */
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
