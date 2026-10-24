import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrors, ZodBody } from '../common/openapi/index.js';
import type { RequestUser } from '../common/types/request-user.js';
import { DevicesService } from './devices.service.js';
import { type DeviceRegistrationDto, DeviceRegistrationSchema } from './dto/device.schemas.js';

// The signed-in user's devices for push notifications: an installation of the
// app registers itself and leaves at sign-out (docs/architecture.md#push-notifications).
@ApiTags('devices')
@Controller('devices')
@Auth()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Put(':installationId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Register this installation for push notifications',
    description:
      "Creates or replaces the installation's push token, for the signed-in account: an installation registered by another account moves to this one, and the token leaves any other installation that had it. Safe to repeat.",
  })
  @ZodBody(DeviceRegistrationSchema)
  @ApiResponse({ status: 204, description: 'Registered' })
  @ApiErrors(400)
  async register(
    @CurrentUser() user: RequestUser,
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Body() body: DeviceRegistrationDto,
    @Headers('x-app-version') appVersion: string | undefined,
  ): Promise<void> {
    await this.devices.register(user.id, installationId, body, appVersion);
  }

  @Delete(':installationId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Stop push notifications to this installation',
    description:
      'Called at sign-out, before the session ends. 404 when the installation is not registered for the signed-in account.',
  })
  @ApiResponse({ status: 204, description: 'Removed' })
  @ApiErrors(400, 404)
  async unregister(
    @CurrentUser() user: RequestUser,
    @Param('installationId', ParseUUIDPipe) installationId: string,
  ): Promise<void> {
    await this.devices.unregister(user.id, installationId);
  }
}
