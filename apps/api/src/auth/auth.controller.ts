import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteRateLimit } from '../common/guards/rate-limit.guard.js';
import type { ApiEnvelope } from '../common/interceptors/transform.interceptor.js';
import { ApiData, ApiErrors, ZodBody } from '../common/openapi/index.js';
import {
  PASSWORD_RESET_CONFIRM_RATE_LIMIT,
  PASSWORD_RESET_REQUEST_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  SIGN_IN_RATE_LIMIT,
  SIGN_UP_CONFIRM_RATE_LIMIT,
  SIGN_UP_RATE_LIMIT,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import {
  type AuthCapabilities,
  AuthCapabilitiesSchema,
  type AuthSession,
  AuthSessionSchema,
  type LogoutDto,
  LogoutSchema,
  type PasswordResetConfirmDto,
  PasswordResetConfirmSchema,
  type PasswordResetRequestDto,
  PasswordResetRequestSchema,
  type RefreshDto,
  RefreshSchema,
  type SignInDto,
  SignInSchema,
  type SignUpConfirmDto,
  SignUpConfirmSchema,
  type SignUpDto,
  SignUpSchema,
} from './dto/auth.schemas.js';
import { PasswordResetService } from './password-reset.service.js';
import { SignUpService } from './sign-up.service.js';

// The app's session: the access token and the refresh token travel in the
// bodies, the app keeps the refresh token in the device's secure storage and
// sends the access token as a bearer (no cookies: docs/adr/0007-mobile-sessions-
// with-refresh-tokens-in-the-body.md). Browsers' cross-site requests never
// reach these routes: the global Fetch Metadata guard refuses them first, and
// only JSON bodies are accepted.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly signUp: SignUpService,
  ) {}

  @Post('sign-in')
  @HttpCode(200)
  @RouteRateLimit(SIGN_IN_RATE_LIMIT)
  @ApiOperation({
    summary: 'Sign in with email and password',
    description:
      'Returns a short-lived access token, a single-use refresh token and the user. The app keeps the refresh token in the secure storage of the device. 429: too many attempts for this address from this client.',
  })
  @ZodBody(SignInSchema)
  @ApiData(AuthSessionSchema)
  @ApiErrors(400, 401, 403)
  async signIn(@Body() body: SignInDto): Promise<ApiEnvelope<AuthSession>> {
    return { data: await this.auth.signIn(body.email, body.password), message: 'Signed in' };
  }

  @Post('refresh')
  @HttpCode(200)
  @RouteRateLimit(REFRESH_RATE_LIMIT)
  @ApiOperation({
    summary: 'Renew the session: a new access token and a new refresh token',
    description:
      'Each refresh token works once and is replaced by the one returned. The same token presented again within 30 seconds of its renewal, while the token that renewal returned is still unused, is a retry after a lost answer: it gets a new pair, and the unused one stops working. Presented again in any other way, the token ends its whole session family (theft response). 401: invalid, expired, revoked or reused.',
  })
  @ZodBody(RefreshSchema)
  @ApiData(AuthSessionSchema)
  @ApiErrors(400, 401, 403)
  async refresh(@Body() body: RefreshDto): Promise<ApiEnvelope<AuthSession>> {
    return { data: await this.auth.refresh(body.refreshToken), message: 'Session refreshed' };
  }

  // Idempotent: the presented token's whole family is revoked if known; an
  // unknown, expired or already revoked token answers the same.
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'End the session family of a refresh token',
    description: 'Idempotent: 204 whether the token was live, already ended or unknown.',
  })
  @ZodBody(LogoutSchema)
  @ApiResponse({ status: 204, description: 'Signed out' })
  @ApiErrors(400, 403)
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  // Public and the same for everyone: the app shows only what works here.
  @Get('capabilities')
  @ApiOperation({
    summary:
      'What this deployment offers: password recovery, public sign-up, change of email, invitations',
  })
  @ApiData(AuthCapabilitiesSchema)
  capabilities(): AuthCapabilities {
    return {
      passwordReset: this.passwordReset.available,
      signUp: this.signUp.available,
      // These need email only: the same answer as passwordReset.
      emailChange: this.passwordReset.available,
      invitations: this.passwordReset.available,
    };
  }

  // Public sign-up (docs/security.md#sign-up), when SIGN_UP_ENABLED. The same
  // answer, at the same speed, whether the address has an account or not.
  @Post('sign-ups')
  @HttpCode(202)
  @RouteRateLimit(SIGN_UP_RATE_LIMIT)
  @ApiOperation({
    summary: 'Sign up: ask for a confirmation link',
    description:
      'Answers 202 for any well-formed request whose password follows the policy. A new address gets a one-time link (valid 24 hours) to confirm it; one that already has an account gets a notice to its owner instead. No account exists until the link is confirmed. 400: the password is refused (too short, too common, too easy to guess, or containing the email or name). 403: sign-up is closed here.',
  })
  @ZodBody(SignUpSchema)
  @ApiResponse({ status: 202, description: 'Accepted' })
  @ApiErrors(400, 403)
  requestSignUp(@Body() body: SignUpDto): void {
    this.signUp.request(body);
  }

  @Post('sign-ups/confirm')
  @HttpCode(200)
  @RouteRateLimit(SIGN_UP_CONFIRM_RATE_LIMIT)
  @ApiOperation({
    summary: "Confirm a sign-up with its link's token and its password",
    description:
      'Creates the account and signs it in, like a sign-in (access token, refresh token, user). 401: not the password chosen at sign-up (a few wrong ones drop the sign-up). 403: sign-up is closed here. 404: the link is invalid, replaced, used or expired. 409: the address got an account meanwhile.',
  })
  @ZodBody(SignUpConfirmSchema)
  @ApiData(AuthSessionSchema)
  @ApiErrors(400, 401, 403, 404, 409)
  async confirmSignUp(@Body() body: SignUpConfirmDto): Promise<ApiEnvelope<AuthSession>> {
    return {
      data: await this.signUp.confirm(body.token, body.password),
      message: 'Account created',
    };
  }

  // The same answer, at the same speed, for every address: whether it has an
  // account is never told (docs/security.md#password-recovery). Each address
  // gets at most one message a minute and a few a day (the outbox).
  @Post('password-resets')
  @HttpCode(204)
  @RouteRateLimit(PASSWORD_RESET_REQUEST_RATE_LIMIT)
  @ApiOperation({
    summary: 'Ask for a password reset link',
    description:
      'Answers 204 for any well-formed address. If it has an account, a message with a one-time link (valid 30 minutes) is on its way. 503 when this deployment sends no email.',
  })
  @ZodBody(PasswordResetRequestSchema)
  @ApiResponse({ status: 204, description: 'Accepted' })
  @ApiErrors(400, 403, 503)
  requestPasswordReset(@Body() body: PasswordResetRequestDto): void {
    this.passwordReset.request(body.email);
  }

  @Post('password-resets/confirm')
  @HttpCode(204)
  @RouteRateLimit(PASSWORD_RESET_CONFIRM_RATE_LIMIT)
  @ApiOperation({
    summary: "Choose a new password with a reset link's token",
    description:
      'The token works once. Every session of the account ends; nobody is signed in. 400: the new password is refused (too short, too common, too easy to guess, or containing the email or name), the link still works. 404: the link is invalid, used or expired.',
  })
  @ZodBody(PasswordResetConfirmSchema)
  @ApiResponse({ status: 204, description: 'Password changed' })
  @ApiErrors(400, 403, 404)
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto): Promise<void> {
    await this.passwordReset.confirm(body.token, body.password);
  }
}
