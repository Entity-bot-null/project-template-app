import { z } from 'zod';
import { freeText } from '../../common/free-text.js';
import { ROLES } from '../../common/types/request-user.js';
import { PASSWORD_MAX_INPUT_LENGTH } from '../auth.constants.js';

export const SignInSchema = z.object({
  // Trimmed before the format check; the service lowercases it. The meta
  // keeps `format: email` in the contract, which the pipe would drop.
  email: z.string().trim().max(254).pipe(z.email()).meta({ format: 'email' }),
  // No password policy on sign-in: whatever was accepted when it was set
  // must keep working. The maximum only bounds the hashing work.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_INPUT_LENGTH),
});
export type SignInDto = z.infer<typeof SignInSchema>;

// Who a session belongs to (GET /api/users/me tells more).
export const AuthUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: z.enum(ROLES),
  })
  .meta({ id: 'SessionUser' });
export type AuthUser = z.infer<typeof AuthUserSchema>;

// A session as the app receives it: the access token for the Authorization
// header, the refresh token it keeps in the device's secure storage (sent back
// once, at the next renewal: each one works once), and the user.
export const AuthSessionSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    /** Seconds until the access token expires. */
    expiresIn: z.number().int(),
    user: AuthUserSchema,
  })
  .meta({ id: 'Session' });
export type AuthSession = z.infer<typeof AuthSessionSchema>;

// A refresh token is 32 random bytes in base64url: anything else is refused
// before any lookup.
export const REFRESH_TOKEN = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid refresh token')
  .meta({ description: 'The refresh token the last session response returned.' });

export const RefreshSchema = z.object({ refreshToken: REFRESH_TOKEN });
export type RefreshDto = z.infer<typeof RefreshSchema>;

export const LogoutSchema = z.object({ refreshToken: REFRESH_TOKEN });
export type LogoutDto = z.infer<typeof LogoutSchema>;

// The claims of the access token: the signer builds exactly this and the
// guard accepts exactly this, so a new claim changes both at once. sv is the
// user's securityVersion when the token was minted: once it moves on (a new
// password), the guard refuses the token at once instead of letting it live
// out its 15 minutes.
export const AccessTokenPayloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(ROLES),
  sv: z.number().int().nonnegative(),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

// What this deployment offers, so the app shows only what works.
export const AuthCapabilitiesSchema = z
  .object({
    /** Email is configured: "Forgot your password?" can send a link. */
    passwordReset: z.boolean(),
    /** Public sign-up is open (SIGN_UP_ENABLED): "Create an account". */
    signUp: z.boolean(),
    /** Email is configured: the Account page can change the address (confirmed by a link). */
    emailChange: z.boolean(),
    /** Email is configured: administrators can invite people to create an account. */
    invitations: z.boolean(),
  })
  .meta({ id: 'Capabilities' });
export type AuthCapabilities = z.infer<typeof AuthCapabilitiesSchema>;

export const PasswordResetRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()).meta({ format: 'email' }),
});
export type PasswordResetRequestDto = z.infer<typeof PasswordResetRequestSchema>;

// A token is 32 random bytes in base64url: anything else is refused before
// any lookup.
export const ONE_TIME_TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid link');

// The policy (password-policy.ts) is checked by the service, which knows the
// account; the schema bounds the size.
const newPassword = z.string().min(1, 'Password is required').max(PASSWORD_MAX_INPUT_LENGTH);

export const PasswordResetConfirmSchema = z.object({
  token: ONE_TIME_TOKEN,
  password: newPassword,
});
export type PasswordResetConfirmDto = z.infer<typeof PasswordResetConfirmSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(PASSWORD_MAX_INPUT_LENGTH),
  newPassword,
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

// The policy is checked by the service (it needs the email and the name);
// the schema bounds the sizes. Names are trimmed, as user:create stores them.
export const SignUpSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()).meta({ format: 'email' }),
  name: freeText().min(1, 'Name is required').max(100),
  password: newPassword,
});
export type SignUpDto = z.infer<typeof SignUpSchema>;

// The password chosen at sign-up, checked against it: no policy here, only
// the size bound.
export const SignUpConfirmSchema = z.object({
  token: ONE_TIME_TOKEN,
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_INPUT_LENGTH),
});
export type SignUpConfirmDto = z.infer<typeof SignUpConfirmSchema>;

export const ChangeEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(PASSWORD_MAX_INPUT_LENGTH),
  newEmail: z.string().trim().max(254).pipe(z.email()).meta({ format: 'email' }),
});
export type ChangeEmailDto = z.infer<typeof ChangeEmailSchema>;

// Deleting the account confirms the current password: no policy, only the
// size bound.
export const DeleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_INPUT_LENGTH),
});
export type DeleteAccountDto = z.infer<typeof DeleteAccountSchema>;

export const EmailChangeConfirmSchema = z.object({ token: ONE_TIME_TOKEN });
export type EmailChangeConfirmDto = z.infer<typeof EmailChangeConfirmSchema>;

// Undoing a change of address also sets a new password (whoever changed the
// address knew the old one): the policy is checked by the service.
export const EmailRevertSchema = z.object({ token: ONE_TIME_TOKEN, password: newPassword });
export type EmailRevertDto = z.infer<typeof EmailRevertSchema>;

// Accepting an invitation: the person chooses their name and password (the
// policy is checked by the service, which knows the address).
export const InvitationAcceptSchema = z.object({
  token: ONE_TIME_TOKEN,
  name: freeText().min(1, 'Name is required').max(100),
  password: newPassword,
});
export type InvitationAcceptDto = z.infer<typeof InvitationAcceptSchema>;
