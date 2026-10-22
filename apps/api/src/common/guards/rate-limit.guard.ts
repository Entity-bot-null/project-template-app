import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  seconds,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { normalizeEmail } from '../utils/email.js';
import { sha256Hex } from '../utils/sha256.js';

// Rate limiting (docs/security.md#rate-limiting), by three throttlers that each
// count every request they apply to:
//   default   every route: RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_SEC, per
//             signed-in user (a valid access token); without one, per client
//             IP and the account the route counts (below), or per client IP;
//   route     only the routes that declare a tighter limit of their own with
//             @RouteRateLimit, on top of the global one: whichever runs out
//             first blocks. Per signed-in user, or per client IP and the
//             account the request names (an address, a token);
//   route-ip  the per-address ceiling of a route counted per account.
// Phones often share one public address (carrier NAT): counting a signed-in
// person, or an attempt per account, keeps one person's traffic from blocking
// everyone behind the same address, and the ceiling still bounds what one
// address can do.
// Never set a route's limit with @Throttle({ default: ... }): that replaces
// the global limit for the route instead of adding to it, so a global limit
// set tighter than the route's would stop applying there.

export const ROUTE_THROTTLER = 'route';
export const ROUTE_IP_THROTTLER = 'route-ip';

/** A field of the request body a route's limit counts per (with the client IP). */
export type RouteLimitField = 'email' | 'refreshToken' | 'token';

/** What a route's own limit counts per: a field of the body, or the signed-in user. */
export type RouteLimitKey = RouteLimitField | 'user';

export interface RouteLimit {
  /** Requests per client IP (or per what `per` names)... */
  limit: number;
  /** ...in this many seconds. */
  ttlSec: number;
  /**
   * Counts per signed-in user (`user`: routes behind @Auth), or per client IP
   * and a field of the body: the address tried (`email`), the refresh token
   * presented (`refreshToken`) or a link's token (`token`), hashed. Without
   * it, per client IP only.
   */
  per?: RouteLimitKey;
  /** With a field of the body: every account from one address together, a looser limit. */
  ipCeiling?: { limit: number; ttlSec: number };
}

const ROUTE_LIMIT = 'app:route-rate-limit';
const reflector = new Reflector();

/** A tighter limit of the route's own, counted on top of the global limit. */
export const RouteRateLimit = (rule: RouteLimit) => SetMetadata(ROUTE_LIMIT, rule);

function routeLimitOf(context: ExecutionContext): RouteLimit | undefined {
  return reflector.getAllAndOverride<RouteLimit | undefined>(ROUTE_LIMIT, [
    context.getHandler(),
    context.getClass(),
  ]);
}

function declaredRouteLimit(context: ExecutionContext): RouteLimit {
  const rule = routeLimitOf(context);
  // Unreachable: the route throttler skips every route without one.
  if (rule === undefined) throw new Error('This route declares no @RouteRateLimit');
  return rule;
}

function declaredIpCeiling(context: ExecutionContext): { limit: number; ttlSec: number } {
  const ceiling = routeLimitOf(context)?.ipCeiling;
  // Unreachable: the ceiling throttler skips every route without one.
  if (ceiling === undefined) throw new Error('This route declares no ipCeiling');
  return ceiling;
}

/** The client address Express resolved through trust proxy. */
const clientIp = (req: Request): string => req.ip ?? 'unknown';

/**
 * The account a request names, for a per-account limit. The body is read
 * before validation (guards run before pipes): anything but a string counts
 * as no account, which the validation then refuses.
 */
export function accountKeyOf(req: Request, field: RouteLimitField): string {
  const body: unknown = req.body;
  const value =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)[field]
      : undefined;
  if (typeof value !== 'string') return '-';
  // Hashed: no address or token is kept as a counter's key.
  return sha256Hex(field === 'email' ? normalizeEmail(value) : value);
}

/** The ThrottlerModule options: the three throttlers, on `storage` (RATE_LIMIT_STORE). */
export function rateLimitOptions(
  storage: ThrottlerStorage,
  global: { limit: number; windowSec: number },
  /** The id of the signed-in user a request's valid access token names, if any. */
  signedInUser: (req: Request) => Promise<string | undefined>,
): ThrottlerModuleOptions {
  // Two throttlers may ask for one request: its token is verified once.
  const users = new WeakMap<Request, Promise<string | undefined>>();
  const userOf = (req: Request): Promise<string | undefined> => {
    let user = users.get(req);
    if (user === undefined) {
      user = signedInUser(req);
      users.set(req, user);
    }
    return user;
  };
  /** Per signed-in user, else per client IP and the route's field, else per client IP. */
  const trackerOf = async (req: Request, per: RouteLimitKey | undefined): Promise<string> => {
    const user = await userOf(req);
    if (user !== undefined) return `user:${user}`;
    const ip = `ip:${clientIp(req)}`;
    return per === undefined || per === 'user' ? ip : `${ip}|${accountKeyOf(req, per)}`;
  };

  return {
    throttlers: [
      {
        name: 'default',
        limit: global.limit,
        ttl: seconds(global.windowSec),
        getTracker: (req, context) => trackerOf(req as Request, routeLimitOf(context)?.per),
      },
      {
        name: ROUTE_THROTTLER,
        // Routes without a limit of their own keep no counter here at all.
        skipIf: (context) => routeLimitOf(context) === undefined,
        limit: (context) => declaredRouteLimit(context).limit,
        ttl: (context) => seconds(declaredRouteLimit(context).ttlSec),
        getTracker: (req, context) => {
          const { per } = declaredRouteLimit(context);
          // A field of the body counts per account whoever is signed in: a
          // sign-in or a link is about the account it names.
          if (per === 'user') return trackerOf(req as Request, per);
          const ip = `ip:${clientIp(req as Request)}`;
          return per === undefined ? ip : `${ip}|${accountKeyOf(req as Request, per)}`;
        },
      },
      {
        name: ROUTE_IP_THROTTLER,
        skipIf: (context) => routeLimitOf(context)?.ipCeiling === undefined,
        limit: (context) => declaredIpCeiling(context).limit,
        ttl: (context) => seconds(declaredIpCeiling(context).ttlSec),
        getTracker: (req) => `ip:${clientIp(req as Request)}`,
      },
    ],
    errorMessage: 'Too many requests, retry later',
    storage,
  };
}

// The throttler's guard, answering every 429 with the standard Retry-After,
// whichever throttler blocked: the library names a named throttler's header
// after it (Retry-After-route), which clients do not read.
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(detail.timeToBlockExpire));
    await super.throwThrottlingException(context, detail);
  }
}
