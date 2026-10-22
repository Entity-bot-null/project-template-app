import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ACCOUNT_DELETION_RATE_LIMIT,
  EMAIL_CHANGE_RATE_LIMIT,
  PASSWORD_CHANGE_RATE_LIMIT,
} from '../auth/auth.constants.js';
import { Auth } from '../auth/auth.decorator.js';
import {
  type AuthSession,
  AuthSessionSchema,
  type ChangeEmailDto,
  ChangeEmailSchema,
  type ChangePasswordDto,
  ChangePasswordSchema,
  type DeleteAccountDto,
  DeleteAccountSchema,
} from '../auth/dto/auth.schemas.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RouteRateLimit } from '../common/guards/rate-limit.guard.js';
import type { ApiEnvelope } from '../common/interceptors/transform.interceptor.js';
import { ApiData, ApiErrors, ZodBody } from '../common/openapi/index.js';
import type { RequestUser } from '../common/types/request-user.js';
import { AccountService } from './account.service.js';
import { EmailChangeService } from './email-change.service.js';

// The signed-in person's own account. Under /api/account, not /api/auth: the
// app sends the access token to every route outside /api/auth/.
@ApiTags('account')
@Controller('account')
@Auth()
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly emailChange: EmailChangeService,
  ) {}

  @Post('password')
  @HttpCode(200)
  @RouteRateLimit(PASSWORD_CHANGE_RATE_LIMIT)
  @ApiOperation({
    summary: 'Change the password, confirming the current one',
    description:
      'Every session ends, this one included; this device carries on with the new session returned (access token, refresh token, user), which the app adopts. 400: the new password is refused (too short, too common, too easy to guess, or containing the email or name). 403: the current password is wrong. 409: the password changed meanwhile.',
  })
  @ZodBody(ChangePasswordSchema)
  @ApiData(AuthSessionSchema)
  @ApiErrors(400, 403, 409)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() body: ChangePasswordDto,
  ): Promise<ApiEnvelope<AuthSession>> {
    const session = await this.account.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    return { data: session, message: 'Password changed' };
  }

  // The same answer whether the new address has an account or not
  // (docs/security.md#change-of-email); nothing changes until the link sent
  // to it is confirmed.
  @Post('email')
  @HttpCode(202)
  @RouteRateLimit(EMAIL_CHANGE_RATE_LIMIT)
  @ApiOperation({
    summary: 'Ask to change the email address, confirming the current password',
    description:
      'Answers 202 once the current password is checked: a one-time link (valid 24 hours) goes to the new address, which changes only when it is opened; if the new address already has an account, its owner gets a notice instead. 400: the new address is the current one. 403: the current password is wrong. 503: this deployment sends no email.',
  })
  @ZodBody(ChangeEmailSchema)
  @ApiResponse({ status: 202, description: 'Accepted' })
  @ApiErrors(400, 403, 503)
  async changeEmail(@CurrentUser() user: RequestUser, @Body() body: ChangeEmailDto): Promise<void> {
    await this.emailChange.request(user.id, body.currentPassword, body.newEmail);
  }

  // Required in the app by the stores (docs/store-compliance.md): an account
  // created in the app can be deleted in the app. For good, at once
  // (docs/adr/0012-account-deletion.md).
  @Post('deletion')
  @HttpCode(204)
  @RouteRateLimit(ACCOUNT_DELETION_RATE_LIMIT)
  @ApiOperation({
    summary: 'Delete the account for good, confirming the password',
    description:
      'Deletes the account and everything it owns, at once and for good; every session ends, this one included, and a notice goes to the address. The app then signs out locally. 403: the password is wrong. 409: the account is the only administrator, or its password changed meanwhile.',
  })
  @ZodBody(DeleteAccountSchema)
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiErrors(400, 403, 409)
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: DeleteAccountDto,
  ): Promise<void> {
    await this.account.deleteAccount(user.id, body.password);
  }
}
