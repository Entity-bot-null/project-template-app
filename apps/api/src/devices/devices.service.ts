import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { parseAppVersion } from '../common/http/app-version.middleware.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DeviceRegistrationDto } from './dto/device.schemas.js';

// The devices push notifications go to (docs/architecture.md#push-notifications).
// An installation of the app names itself with a random id and registers its
// push token for the signed-in account: at a sign-in, at each start, when the
// user allows notifications, and whenever the token changes. One row per
// installation and one per token, so a registration is an upsert: the same
// installation under another account (a sign-in on a shared phone) moves to
// it, and a token registered by another installation (a reinstall) leaves its
// old row. Only the caller's own installation can be removed: another
// account's answers 404, like a missing one.
@Injectable()
export class DevicesService {
  private readonly logger = new Logger('Devices');

  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    installationId: string,
    registration: DeviceRegistrationDto,
    appVersionHeader: string | undefined,
  ): Promise<void> {
    // Kept as the app sent it, only when it is a version (for cleaning up
    // tokens of old versions); anything else is dropped, never an error.
    const appVersion =
      appVersionHeader !== undefined && parseAppVersion(appVersionHeader) !== undefined
        ? appVersionHeader.trim()
        : null;
    const data = {
      userId,
      pushToken: registration.pushToken,
      platform: registration.platform,
      kind: registration.kind,
      appVersion,
      lastSeenAt: new Date(),
      disabledAt: null,
    };
    const moved = await this.prisma.$transaction(async (tx) => {
      // The token now belongs to this installation only.
      await tx.device.deleteMany({
        where: { pushToken: registration.pushToken, NOT: { installationId } },
      });
      const previous = await tx.device.findUnique({
        where: { installationId },
        select: { userId: true },
      });
      await tx.device.upsert({
        where: { installationId },
        create: { installationId, ...data },
        update: data,
        select: { id: true },
      });
      return previous !== null && previous.userId !== userId;
    });
    if (moved) this.logger.log(`Installation ${installationId} moved to user ${userId}`);
  }

  async unregister(userId: string, installationId: string): Promise<void> {
    const { count } = await this.prisma.device.deleteMany({ where: { installationId, userId } });
    if (count === 0) throw new NotFoundException('Device not found');
  }
}
