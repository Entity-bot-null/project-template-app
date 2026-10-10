import { z } from 'zod';

// What the API returns for sessions, checked at runtime: these responses
// decide who the user is and which credentials the app keeps.

export const TokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: z.enum(['member', 'admin']),
});

export const SessionSchema = TokensSchema.extend({ user: UserSchema });

export type Tokens = z.infer<typeof TokensSchema>;
export type User = z.infer<typeof UserSchema>;

export interface Credentials {
  email: string;
  password: string;
}
