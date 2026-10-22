import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../env/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TOKEN_ALGORITHM } from './auth.constants.js';
import { type AccessTokenPayload, AccessTokenPayloadSchema } from './dto/auth.schemas.js';

// RFC 7235: the scheme is case-insensitive.
const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** The access token of a request's Authorization header, when it has one. */
export function bearerTokenOf(req: Request): string | undefined {
  return BEARER.exec(req.get('Authorization') ?? '')?.[1];
}

/**
 * The claims of an access token whose signature, expiry and claims are valid,
 * checked offline; undefined otherwise. Tried with the current secret, then
 * the previous one while a rotation is in progress (JWT_ACCESS_SECRET_PREVIOUS):
 * tokens it signed stay valid until they expire, so a planned rotation signs
 * nobody out (docs/security.md#secret-rotation). Whether the account still
 * accepts the token (its securityVersion) is the guard's question.
 */
export async function verifiedAccessToken(
  jwt: JwtService,
  token: string,
): Promise<AccessTokenPayload | undefined> {
  const secrets = [env.JWT_ACCESS_SECRET, env.JWT_ACCESS_SECRET_PREVIOUS].filter(
    (secret) => secret !== undefined,
  );
  for (const secret of secrets) {
    try {
      // The algorithm is pinned here as well as in the module, so a
      // differently configured JwtService can never loosen this check.
      const claims = await jwt.verifyAsync<object>(token, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        secret,
      });
      const payload = AccessTokenPayloadSchema.safeParse(claims);
      return payload.success ? payload.data : undefined;
    } catch {
      // Wrong secret, expired or malformed: the next secret, or undefined.
    }
  }
  return undefined;
}

/**
 * The user a request's valid access token names, if any: what the rate
 * limiter counts a signed-in person by (it runs before this guard). Checked
 * offline, without the account's securityVersion: a key to count by, never a
 * permission.
 */
export function signedInUserOf(jwt: JwtService): (req: Request) => Promise<string | undefined> {
  return async (req) => {
    const token = bearerTokenOf(req);
    return token === undefined ? undefined : (await verifiedAccessToken(jwt, token))?.sub;
  };
}

// Authenticates a request from its bearer access token and puts the caller on
// req.user for @CurrentUser(). The signature, expiry and claims are checked
// offline; then one primary-key read compares the token's securityVersion (sv)
// with the account's: a new password or a reset ends every access token at
// once, not up to 15 minutes later, and a deleted account's tokens stop
// working. A role change still applies at the next refresh (the role is the
// token's). Role checks are RolesGuard's.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerTokenOf(req);
    if (token === undefined) throw new UnauthorizedException('Missing access token');

    const payload = await verifiedAccessToken(this.jwt, token);
    if (payload === undefined) throw new UnauthorizedException('Invalid or expired access token');

    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { securityVersion: true },
    });
    if (account?.securityVersion !== payload.sv) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    req.user = { id: payload.sub, role: payload.role };
    return true;
  }
}
