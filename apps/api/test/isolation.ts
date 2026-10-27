import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/env/env.js';
import { PrismaClient } from '../src/prisma/generated/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * A client of the test database whose transactions start at `isolation`
 * unless they say otherwise: a database or role configured with a stricter
 * default (a managed service's parameter, a DBA's choice). The services only
 * need the client's queries and transactions, so it stands in for
 * PrismaService. Disconnect it at the end of the spec.
 */
export async function clientWithDefaultIsolation(
  isolation: 'repeatable read' | 'serializable',
): Promise<PrismaService> {
  const url = new URL(env.DATABASE_URL);
  // PostgreSQL's startup options: a space inside a value is escaped.
  url.searchParams.set(
    'options',
    `-c default_transaction_isolation=${isolation.replace(' ', String.raw`\ `)}`,
  );
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const [setting] = await client.$queryRaw<{ default_transaction_isolation: string }[]>`
    SHOW default_transaction_isolation`;
  if (setting?.default_transaction_isolation !== isolation) {
    await client.$disconnect();
    throw new Error(`The test database did not take default_transaction_isolation=${isolation}`);
  }
  return client as unknown as PrismaService;
}
