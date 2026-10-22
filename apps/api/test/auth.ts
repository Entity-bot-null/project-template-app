import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { hashPassword } from '../src/auth/password.js';
import type { Role } from '../src/common/types/request-user.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { envelopeOf } from './http.js';

export const TEST_PASSWORD = 'correct-horse-battery';

/** Creates a user with a real argon2 hash; the role defaults to member. */
export async function seedUser(
  prisma: PrismaService,
  data: { email: string; name?: string; role?: Role },
) {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name ?? data.email.split('@')[0] ?? data.email,
      role: data.role ?? 'member',
      passwordHash: await hashPassword(TEST_PASSWORD),
    },
  });
}

export interface SignedIn {
  accessToken: string;
  /** Sent back once, to POST /api/auth/refresh or /logout: each one works once. */
  refreshToken: string;
  user: { id: string; email: string; name: string; role: Role };
}

/** Signs in through the API and returns the session the app would keep. */
export async function signIn(
  server: Server,
  email: string,
  password = TEST_PASSWORD,
): Promise<SignedIn> {
  const res = await request(server).post('/api/auth/sign-in').send({ email, password }).expect(200);
  return sessionOf(res);
}

/** The session a response carries (sign-in, refresh, sign-up confirmation...). */
export function sessionOf(res: request.Response): SignedIn {
  return envelopeOf<SignedIn>(res).data;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * A bearer header minted with the app's own signer, for a user the suite
 * created (seedUser): the guard checks the token's securityVersion (sv)
 * against the account's, 0 for a new one.
 */
export function asUser(app: INestApplication, id: string, role: Role = 'member', sv = 0) {
  return bearer(app.get(JwtService).sign({ sub: id, role, sv }));
}
