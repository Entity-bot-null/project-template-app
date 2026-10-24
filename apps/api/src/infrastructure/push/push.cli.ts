import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../env/env.js';
import { PrismaClient } from '../../prisma/generated/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { pushOptionsFromEnv } from './push.module.js';
import { PushStore } from './push.store.js';

// The push outbox's operator command (docs/manual.md#59-push-notifications,
// docs/incident-response.md#19-push-notifications-not-delivered).
// Locally:
//   pnpm --filter api push status      the queue, the devices, the latest failures
// in a deployment, with the API image (docs/deploy-vps.md; on any other
// platform, `docker run --rm --env-file <api env> <api image>` instead):
//   docker compose ... run --rm -T api node dist/infrastructure/push/push.cli.js status
// The database is the one in DATABASE_URL; notifications are sent by the
// API's workers, never by this command. Tokens and users are never printed:
// a notification and a device are named by their ids.

const USAGE = `Usage:
  push status                              the queue, the devices and the latest failures`;

const { positionals } = parseArgs({ allowPositionals: true, options: {} });

const options = pushOptionsFromEnv();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const store = new PushStore(prisma as unknown as PrismaService);

async function showStatus(): Promise<void> {
  console.log(
    `Push is ${options.enabled ? 'on' : 'off (PUSH_ENABLED unset)'}${options.enabled && options.accessToken === undefined ? ", without Expo's enhanced security (EXPO_ACCESS_TOKEN unset)" : ''}.`,
  );
  const { waiting, oldestAgeSeconds } = await store.stats();
  console.log(
    `${String(waiting)} notification(s) to send; the oldest waiting for ${String(Math.round(oldestAgeSeconds))} s.`,
  );
  const counts = await prisma.pushMessage.groupBy({
    by: ['status', 'kind'],
    _count: { _all: true },
    orderBy: [{ status: 'asc' }, { kind: 'asc' }],
  });
  for (const row of counts) {
    console.log(`  ${row.status.padEnd(9)} ${row.kind.padEnd(18)} ${String(row._count._all)}`);
  }
  const devices = await prisma.device.groupBy({
    by: ['platform'],
    _count: { _all: true },
    orderBy: { platform: 'asc' },
  });
  const disabled = await prisma.device.count({ where: { disabledAt: { not: null } } });
  console.log(
    `Devices: ${devices.map((row) => `${row.platform} ${String(row._count._all)}`).join(', ') || 'none'}; ${String(disabled)} disabled (their token died).`,
  );
  const failed = await prisma.pushMessage.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { id: true, kind: true, attempts: true, lastError: true, updatedAt: true },
  });
  if (failed.length > 0) {
    console.log('Latest failed notifications:');
    for (const m of failed) {
      console.log(
        `  ${m.updatedAt.toISOString()}  ${m.id}  ${m.kind}  attempts=${String(m.attempts)}  error=${m.lastError ?? '?'}`,
      );
    }
  }
}

try {
  if (positionals[0] === 'status') await showStatus();
  else throw new Error(USAGE);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
