import { z } from 'zod';

import type { components } from '@/api/client';

// What the API returns for sessions, checked at runtime: these responses
// decide who the user is and which credentials the app keeps. `satisfies`
// keeps each schema in step with the generated contract types.

type Schemas = components['schemas'];

export const TokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
}) satisfies z.ZodType<Omit<Schemas['Session'], 'user'>>;

/** Who a session belongs to. */
export const SessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: z.enum(['member', 'admin']),
}) satisfies z.ZodType<Schemas['SessionUser']>;

/** The account, as GET /api/users/me tells it. */
export const UserSchema = SessionUserSchema.extend({
  createdAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<Schemas['User']>;

export const SessionSchema = TokensSchema.extend({
  user: SessionUserSchema,
}) satisfies z.ZodType<Schemas['Session']>;

export type Tokens = z.infer<typeof TokensSchema>;
export type User = z.infer<typeof SessionUserSchema>;

export interface Credentials {
  email: string;
  password: string;
}
