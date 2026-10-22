import { Injectable, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_TOKEN_TTL_SEC, normalizeEmail } from './auth.constants.js';
import type { AccessTokenPayload, AuthSession, AuthUser } from './dto/auth.schemas.js';
import { checkPassword, dummyPasswordHash } from './password.js';
import { SessionsService, type StartedSession } from './sessions.service.js';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  // The dummy hash is built at boot: built on first use, the first sign-in with
  // an unknown email after every start would pay a hash on top of the verify,
  // a timing signal that the account does not exist. A failure here is retried
  // on first use instead of stopping the boot.
  async onModuleInit(): Promise<void> {
    await dummyPasswordHash().catch(() => undefined);
  }

  // One answer for an unknown email and a wrong password, in the same time
  // (an unknown email is checked against a dummy hash): the response never
  // reveals whether an account exists. Every sign-in starts its own family: a
  // device that had a session ends it with a logout first.
  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });
    const valid = await checkPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    const { passwordHash, ...authUser } = user;
    return this.sessionFor(authUser, await this.sessions.create(authUser.id, passwordHash));
  }

  async refresh(token: string): Promise<AuthSession> {
    const { user, session } = await this.sessions.rotate(token);
    return this.sessionFor(user, session);
  }

  logout(token: string): Promise<void> {
    return this.sessions.retire(token);
  }

  // The access token carries the id, the role and the securityVersion, read
  // fresh from the database at sign-in and at every refresh: a role change
  // applies at the next refresh, at most ACCESS_TOKEN_TTL_SEC later; a new
  // password at once (the guard compares the securityVersion). Also used by
  // the account flows that start a session (a sign-up's confirmation, an
  // accepted invitation, a password change).
  async sessionFor(user: AuthUser, session: StartedSession): Promise<AuthSession> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      sv: session.securityVersion,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: session.token,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user,
    };
  }
}
