import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  // @Auth() needs the JwtModule that AuthModule exports.
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
