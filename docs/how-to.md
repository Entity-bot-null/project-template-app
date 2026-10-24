# How-to recipes

Step-by-step instructions for the changes you will make most often, in the app, the API, the
landing and the server. The API recipes are the web template's, whose API this one is: they were
validated there by building a complete example feature (a `notes` table, its API module, contract,
screen and tests) and running every gate on it, and the code below is that example. The app's
recipes follow the items feature (`apps/mobile/src/features/items`), the template's own example:
copy it and rename.

When something fails along the way, see [troubleshooting.md](troubleshooting.md) and the README's
table ([README.md](../README.md#troubleshooting)).

The API:

- [Add a table or a column](#add-a-table-or-a-column)
- [Add an API module (a new resource)](#add-an-api-module)
- [Add an endpoint to an existing module](#add-an-endpoint-to-an-existing-module)
- [Change the API contract](#change-the-api-contract)
- [Add a role](#add-a-role)
- [Cache a read](#cache-a-read)
- [Call an external service](#call-an-external-service)
- [Run a job on one instance, or process a message once](#run-a-job-on-one-instance-or-process-a-message-once)
- [Send an email](#send-an-email)
- [Add a metric and an alert](#add-a-metric-and-an-alert)

The app:

- [Add a screen to the app](#add-a-screen-to-the-app)
- [Add a deep link](#add-a-deep-link)
- [Ask for a permission or add a native module](#ask-for-a-permission-or-add-a-native-module)
- [Ship code behind a feature flag](#ship-code-behind-a-feature-flag)
- [Track an analytics event](#track-an-analytics-event)
- [Add an end-to-end flow](#add-an-end-to-end-flow)

Everywhere:

- [Change the landing: a text, a section, a page, a language](#change-the-landing)
- [Add an environment variable](#add-an-environment-variable)
- [Add a dependency](#add-a-dependency)
- [Run with or without Redis](#run-with-or-without-redis)
- [Turn on error tracking](#turn-on-error-tracking)
- [Turn on tracing and metrics](#turn-on-tracing-and-metrics)
- [Pull changes from the team](#pull-changes-from-the-team)
- [Raise coverage thresholds or a budget](#raise-coverage-thresholds-or-a-budget)
- [Add another app or a background worker](#add-another-app-or-a-background-worker)

Operations: rotate the token secret ([security.md](security.md#secret-rotation)), raise the
minimum app version ([releases.md](releases.md#minimum-supported-version)), ship an OTA update or a
store build ([releases.md](releases.md)), deploy and roll back the server
([deploy-vps.md](deploy-vps.md#operations)).

---

## Add a table or a column

1. Edit `apps/api/prisma/schema.prisma` following [database.md](database.md#conventions): UUIDv7
   key, `Timestamptz(3)` dates, snake_case names, an index for every foreign key and for the
   queries you will run, a deliberate `onDelete`.

   ```prisma
   model User {
     // ... existing fields
     notes Note[]
   }

   // A short text that belongs to one user.
   model Note {
     id        String   @id @default(uuid(7)) @db.Uuid
     ownerId   String   @map("owner_id") @db.Uuid
     title     String
     body      String   @default("")
     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
     updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

     owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

     // Serves "the notes of one owner, newest first".
     @@index([ownerId, createdAt])
     @@map("notes")
   }
   ```

2. Create and apply the migration, and regenerate the client, in one command (database running:
   `pnpm services:up` or `pnpm db:up`):

   ```
   pnpm db:migrate --name add_notes
   ```

   Without `--name` it asks for one. Use snake_case names that say what changes.

3. Review `apps/api/prisma/migrations/<timestamp>_add_notes/migration.sql`: locks on big tables,
   defaults, `DROP` statements. A column that existing rows cannot fill needs a default or the
   [expand/contract](database.md#expand-and-contract) steps. A contract step (a drop, a rename, a
   column made required) needs `-- contract: <why it is safe now>` right above it, or the commit
   and CI stop (`scripts/check-migrations.mjs`).
4. Commit the schema and the migration folder together with the code that uses them. Never edit a
   migration that is already on `main`: the migration image refuses a database that applied an
   earlier text of it.
5. If the development accounts need data in the new table, extend `apps/api/src/seed/seed.ts`
   (idempotent: upsert on a unique key).
6. The running app version keeps working on the new schema, and the previous one too (a rollback
   runs it there): add, never drop or rename in the same release
   ([database.md](database.md#expand-and-contract)).

## Add an API module

A module is a folder in `apps/api/src/<name>/` with its schemas, service, controller, module and
tests. `items/` is the reference for a resource each user owns; `users/` for one with roles. The
example below is the web template's, built and checked there with every gate: the API is the same.

**1. Schemas** (`dto/note.schemas.ts`): input and output shapes, the single source for validation,
the contract and the types.

```ts
import { z } from 'zod';
import { pageOf } from '../../common/pagination.js';

// What the API answers about a note (output).
export const NoteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type NoteResponse = z.infer<typeof NoteSchema>;

export const NotePageSchema = pageOf(NoteSchema);

// What a client may send (input): trimmed, bounded, defaults applied.
export const CreateNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(10_000).default(''),
});
export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;

// Every query selects exactly the documented fields.
export const NOTE_SELECT = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  updatedAt: true,
} as const;
```

**2. Service** (`notes.service.ts`): the rules and the queries. Ownership goes **in the query**.

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PageQuery } from '../common/pagination.js';
import type { RequestUser } from '../common/types/request-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CreateNoteDto, NOTE_SELECT } from './dto/note.schemas.js';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner: RequestUser, { limit, offset }: PageQuery) {
    const where = { ownerId: owner.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.note.findMany({
        where,
        select: NOTE_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.note.count({ where }),
    ]);
    return { items, total };
  }

  create(owner: RequestUser, data: CreateNoteDto) {
    return this.prisma.note.create({ data: { ...data, ownerId: owner.id }, select: NOTE_SELECT });
  }

  // Ownership lives in the query: another user's note is "not found",
  // exactly like a missing one.
  async findOwned(owner: RequestUser, id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, ownerId: owner.id },
      select: NOTE_SELECT,
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async remove(owner: RequestUser, id: string): Promise<void> {
    const { count } = await this.prisma.note.deleteMany({ where: { id, ownerId: owner.id } });
    if (count === 0) throw new NotFoundException('Note not found');
  }
}
```

**3. Controller** (`notes.controller.ts`): thin. Parse (decorators), authorize (`@Auth`), delegate.

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiData, ApiErrors, ZodBody, ZodQuery } from '../common/openapi/index.js';
import { type PageQuery, PageQuerySchema } from '../common/pagination.js';
import type { RequestUser } from '../common/types/request-user.js';
import {
  type CreateNoteDto,
  CreateNoteSchema,
  NotePageSchema,
  NoteSchema,
} from './dto/note.schemas.js';
import { NotesService } from './notes.service.js';

// Every route needs a signed-in user; each one sees only their own notes.
@ApiTags('notes')
@Controller('notes')
@Auth()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({ summary: "The caller's notes, newest first" })
  @ZodQuery(PageQuerySchema)
  @ApiData(NotePageSchema)
  @ApiErrors(400)
  list(@CurrentUser() owner: RequestUser, @Query() query: PageQuery) {
    return this.notes.list(owner, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ZodBody(CreateNoteSchema)
  @ApiData(NoteSchema, { status: 201 })
  @ApiErrors(400)
  create(@CurrentUser() owner: RequestUser, @Body() body: CreateNoteDto) {
    return this.notes.create(owner, body);
  }

  @Get(':id')
  @ApiOperation({ summary: "One of the caller's notes" })
  @ApiData(NoteSchema)
  @ApiErrors(400, 404)
  findOne(@CurrentUser() owner: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.findOwned(owner, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: "Delete one of the caller's notes" })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentUser() owner: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notes.remove(owner, id);
  }
}
```

Admin-only routes: `@Auth('admin')` on the handler or the controller. Public routes (rare):
leave `@Auth()` out, say why in a comment, and add the route to the public ones of
`apps/api/src/openapi/openapi.spec.ts`, which fails on any other route without the bearer
requirement.

**4. Module** (`notes.module.ts`), then add `NotesModule` to the `imports` of
`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

@Module({
  // @Auth() needs the JwtModule that AuthModule exports.
  imports: [AuthModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
```

**5. Contract:** `pnpm contract`, then review the diff of `openapi/openapi.json` and
`apps/mobile/src/api/schema.d.ts`. Until you run it, `pnpm test` fails with `matches the committed
openapi/openapi.json (run pnpm contract when this fails)`: that is the drift gate doing its job.
Then the mock API (`apps/mobile/scripts/mock-api.mjs`) gets the new routes, so the app works
without a backend too; `pnpm test:scripts` checks every answer it gives against the contract.

**6. Unit tests** (`notes.service.spec.ts`): the service with Prisma faked, one test per rule.
Cover **every** service method: unit coverage counts services, guards and utilities, and the
coverage gate fails if new code lowers it (controllers and modules are left to the integration
suite).

```ts
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../common/types/request-user.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotesService } from './notes.service.js';

const OWNER: RequestUser = { id: '0190b6a1-0000-7000-8000-000000000001', role: 'member' };
const NOTE_ID = '0190b6a1-0000-7000-8000-0000000000aa';

// Prisma faked at the method level: the specs check which query the service
// builds (who may match), the integration spec checks the real database.
function setup({ found = null, deleted = 0 }: { found?: unknown; deleted?: number } = {}) {
  const note = {
    findMany: vi.fn().mockReturnValue('findMany-query'),
    count: vi.fn().mockReturnValue('count-query'),
    create: vi.fn().mockResolvedValue({ id: NOTE_ID }),
    findFirst: vi.fn().mockResolvedValue(found),
    deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
  };
  const $transaction = vi.fn().mockResolvedValue([[{ id: NOTE_ID }], 1]);
  const service = new NotesService({ note, $transaction } as unknown as PrismaService);
  return { service, note };
}

describe('NotesService', () => {
  it("lists only the caller's notes, one bounded page in a stable order", async () => {
    const { service, note } = setup();
    await expect(service.list(OWNER, { limit: 10, offset: 20 })).resolves.toEqual({
      items: [{ id: NOTE_ID }],
      total: 1,
    });
    expect(note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: OWNER.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        skip: 20,
      }),
    );
    expect(note.count).toHaveBeenCalledWith({ where: { ownerId: OWNER.id } });
  });

  it('creates the note for the caller, whatever the body says', async () => {
    const { service, note } = setup();
    await service.create(OWNER, { title: 'Groceries', body: '' });
    expect(note.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Groceries', body: '', ownerId: OWNER.id } }),
    );
  });

  it('looks a note up by id AND owner, so other owners never match', async () => {
    const { service, note } = setup({ found: { id: NOTE_ID } });
    await service.findOwned(OWNER, NOTE_ID);
    expect(note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: NOTE_ID, ownerId: OWNER.id } }),
    );
  });

  it('answers 404 when the note is missing or belongs to someone else', async () => {
    await expect(setup().service.findOwned(OWNER, NOTE_ID)).rejects.toThrow(NotFoundException);
  });

  it("deletes only the caller's note and answers 404 otherwise", async () => {
    const { service, note } = setup({ deleted: 1 });
    await service.remove(OWNER, NOTE_ID);
    expect(note.deleteMany).toHaveBeenCalledWith({ where: { id: NOTE_ID, ownerId: OWNER.id } });
    await expect(setup({ deleted: 0 }).service.remove(OWNER, NOTE_ID)).rejects.toThrow(
      'Note not found',
    );
  });
});
```

**7. Integration tests** (`notes.int.spec.ts`): the real app and database. For every protected
resource test: anonymous (401), the owner, **another user (404)**, invalid input (400). A route on
one record gets the access matrix, `expectRecordAccess` ([authorization.md](authorization.md#tests)).

```ts
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectRecordAccess } from '../../test/access.js';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { asUser, seedUser } from '../../test/auth.js';
import { envelopeOf } from '../../test/http.js';
import type { NoteResponse } from './dto/note.schemas.js';

describe('Notes (integration)', () => {
  let t: TestApp;
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    alice = await seedUser(t.prisma, { email: 'alice@example.com' });
    bob = await seedUser(t.prisma, { email: 'bob@example.com' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  const asAlice = () => asUser(t.app, alice.id);
  const asBob = () => asUser(t.app, bob.id);

  it('needs a signed-in user', async () => {
    await request(t.server).get('/api/notes').expect(401);
  });

  it('creates a note and lists it for its owner only', async () => {
    const created = envelopeOf<NoteResponse>(
      await request(t.server)
        .post('/api/notes')
        .set(asAlice())
        .send({ title: '  Groceries ' })
        .expect(201),
    ).data;
    expect(created).toMatchObject({ title: 'Groceries', body: '' });

    const mine = envelopeOf<{ items: NoteResponse[]; total: number }>(
      await request(t.server).get('/api/notes').set(asAlice()).expect(200),
    ).data;
    expect(mine.items.map((note) => note.id)).toEqual([created.id]);

    const theirs = envelopeOf<{ total: number }>(
      await request(t.server).get('/api/notes').set(asBob()).expect(200),
    ).data;
    expect(theirs.total).toBe(0);
  });

  it('lets only the owner read or delete a note; to anyone else it does not exist', async () => {
    const note = await t.prisma.note.create({ data: { ownerId: alice.id, title: 'Private' } });
    const route = { path: (id: string) => `/api/notes/${id}`, id: note.id };
    await expectRecordAccess(t.server, { ...route, owner: asAlice(), other: asBob() });
    await expectRecordAccess(t.server, {
      ...route,
      method: 'delete',
      owner: asAlice(),
      other: asBob(),
      status: 204,
    });
    await request(t.server).get(`/api/notes/${note.id}`).set(asAlice()).expect(404);
  });

  it('validates the body', async () => {
    const res = await request(t.server)
      .post('/api/notes')
      .set(asAlice())
      .send({ title: '' })
      .expect(400);
    expect(envelopeOf(res).message).toMatch(/^title: /);
  });
});
```

**8. Check:** `pnpm verify` and `pnpm test:integration`.

**9. The app:** [Add a screen to the app](#add-a-screen-to-the-app).

## Add an endpoint to an existing module

1. Add the input/output Zod schemas to the module's `dto/` (or reuse existing ones).
2. Add the service method (rules, ownership in the query) and its unit test.
3. Add the handler: route decorator, `@ZodBody`/`@ZodQuery`, `@ApiData`, `@ApiErrors`, and
   `@Auth(...)` if it differs from the controller's.
4. `pnpm contract`, review the contract diff.
5. Integration tests for the new route: allowed, forbidden, other user's record, invalid input.

## Change the API contract

The contract changes whenever a controller or a schema in `dto/` changes. Always: `pnpm contract`,
then commit `openapi/openapi.json` and `apps/mobile/src/api/schema.d.ts` in the same pull request
as the code, keep the mock API in step (`apps/mobile/scripts/mock-api.mjs`, checked by
`pnpm test:scripts`), and point reviewers to the contract diff.

- **Safe (additive):** a new route, a new optional input field, a new output field.
- **Breaking:** removing or renaming a field or route, a new required input, a changed type or
  status code. The app compiles against the generated types, so `pnpm typecheck` shows every call
  that breaks, but **the apps already installed do not**: they keep calling the old contract until
  their users update, which can take months. Ship a breaking change as additive steps instead
  (add the new field, move the app to it, remove the old one once no supported version reads it),
  or combine it with the minimum supported version
  ([api-conventions.md](api-conventions.md), [releases.md](releases.md#minimum-supported-version)).

## Add a role

1. Add the value to `enum Role` in `apps/api/prisma/schema.prisma` and to `ROLES` in
   `apps/api/src/common/types/request-user.ts`, in the same order, least to most privileged (a
   unit spec fails when they differ).
2. `pnpm db:migrate --name add_<role>_role`.
3. Use it: `@Auth('admin', '<role>')` on the routes it may call, ownership rules in the services;
   in the app, a `Stack.Protected` guard on its screens, from `useSessionUser()?.role` (as the
   administration of `apps/mobile/src/app/(app)/_layout.tsx` does). The guard only hides screens:
   the API authorizes every request.
4. `pnpm contract` (the role appears in the contract; the app's `Role` type follows), and the mock
   API's accounts if it needs one.
5. Integration tests for what the role may and may not do; optionally a development account in the
   seed.

## Cache a read

Only for reads that are expensive, frequent and allowed to be up to a TTL old; read the "never
cache" list first ([architecture.md](architecture.md#cache)).

```ts
import { Injectable } from '@nestjs/common';
import { CacheService, type NamespacedCache } from '../infrastructure/cache/cache.service.js';

@Injectable()
export class ReportsService {
  private readonly summaries: NamespacedCache<Summary>;

  constructor(
    cache: CacheService,
    private readonly prisma: PrismaService,
  ) {
    // One namespace per kind of value, declared once (in the constructor:
    // a field initializer would run before `cache` is assigned).
    this.summaries = cache.namespace<Summary>('report-summaries', { ttlSec: 300 });
  }

  summary(ownerId: string): Promise<Summary> {
    // The owner is part of the key: entries never cross users.
    return this.summaries.getOrSet(ownerId, () => this.computeSummary(ownerId));
  }

  async addEntry(ownerId: string, data: EntryInput): Promise<void> {
    await this.prisma.entry.create({ data: { ...data, ownerId } });
    await this.summaries.delete(ownerId); // in the same code path as the change
  }
}
```

`CacheService` is global: no module import needed. Unit specs pass a `MemoryCacheStore`
(`new CacheService(new MemoryCacheStore(), redisKeys)`, see `cache.service.spec.ts`). With several
instances set `CACHE_STORE=redis`, or keep TTLs short: a memory cache is per instance.

## Call an external service

Through the shared client, never a bare `fetch` (docs/observability.md#external-services):

1. Its settings in the env schema (`BILLING_URL`, `BILLING_API_KEY`), `.env.example` and
   docs/environment.md ([Add an environment variable](#add-an-environment-variable)). The base URL
   comes from configuration, never from user input.
2. A small service that owns the client:

   ```ts
   import { Injectable } from '@nestjs/common';
   import { createExternalHttpClient } from '../common/http/external-http.js';
   import { env } from '../env/env.js';

   @Injectable()
   export class BillingClient {
     private readonly http = createExternalHttpClient({
       name: 'billing', // metric attribute, log field, error report tag
       baseUrl: env.BILLING_URL,
       timeoutMs: 3_000,
       headers: () => ({ Authorization: `Bearer ${env.BILLING_API_KEY}` }), // never logged
     });

     async invoice(id: string): Promise<Invoice> {
       // GET <BILLING_URL>/invoices/<id>: each segment is encoded, so an id holding
       // "/", "?" or ".." stays one segment.
       const { body } = await this.http.request<Invoice>({ path: ['invoices', id] });
       return body;
     }
   }
   ```

   Paths are relative to `baseUrl`, whose own path is kept (`https://billing.example.com/v1`, with
   or without a final `/`, gives `/v1/invoices/...`). Write a fixed path as a string (`'invoices'`)
   and put values in as segments (`['invoices', id]`), never into a string. The client refuses,
   before sending anything, a path that starts with `/` (it would drop the base path), one with a
   `.` or `..` segment, a backslash, a tab or a newline, and one that would leave the base URL; a
   `baseUrl` with a query string or a fragment fails at construction.

3. Let `ExternalServiceError` reach the error filter (502, or 504 on a timeout, reported as a
   dependency failure), or catch it where the feature has a fallback (`error.status === 404`:
   not found upstream). POST and PATCH are not retried unless you pass `idempotent: true` with an
   idempotency key the provider honors.
4. Unit specs inject `fetch` and `sleep` (`external-http.spec.ts` shows how).

## Run a job on one instance, or process a message once

```ts
// A scheduled job that must not run on every instance at once:
const run = await this.locks.withLock('jobs:nightly-report', 15 * 60_000, () => this.buildReport());
if (!run.acquired) return; // another instance has it

// A webhook the provider may deliver twice, or again while the first delivery is processed:
const outcome = await this.idempotency.claim('webhooks:billing', event.id, {
  processingTtlSec: 5 * 60, // longer than apply() can take
  doneTtlSec: 24 * 60 * 60, // the provider's redelivery window
});
if (outcome.status === 'done') return; // processed already: acknowledge it
if (outcome.status === 'in-progress') {
  // Never a 2xx: the provider would stop retrying, and the event would be lost
  // if the attempt in progress fails.
  throw new ConflictException('This event is being processed: retry later');
}
try {
  await this.apply(event);
} catch (error) {
  await outcome.claim.release(); // let the provider's retry through
  throw error;
}
await outcome.claim.complete();
```

A delivery whose attempt crashed (the process died mid-`apply`) is processed again by the
provider's first retry after `processingTtlSec`.

`LockService` and `IdempotencyService` are global. They hold across instances with `REDIS_URL`,
within the process without it, and fail closed (503) while Redis is down. For money or anything that
must happen exactly once, make the write itself idempotent in the database
([architecture.md](architecture.md#locks-and-idempotency)).

## Send an email

Email goes through the outbox ([architecture.md](architecture.md#email)): you queue a message in
the transaction of the change it reports, never send it from the request.

1. **A kind.** Add it to `MailKind` in `apps/api/prisma/schema.prisma` and run
   `pnpm db:migrate --name add_<kind>_mail_kind` (`ALTER TYPE ... ADD VALUE`: an expand step).
2. **A template** in `apps/api/src/infrastructure/mail/templates/`, registered in `registry.ts`:

   ```ts
   export const welcomeTemplate: MailTemplate = {
     limited: false, // true when anyone can trigger it (a reset, a confirmation): per-address limits
     ttlMs: 24 * 60 * 60_000, // dropped unsent after this
     async compose({ tx, message, product, appUrl }) {
       const user = await tx.user.findUnique({ where: { id: message.userId ?? '' } });
       if (user === null || user.email !== message.recipient) return null; // no longer applies
       return renderMail(
         {
           subject: `Welcome to ${product}`,
           heading: `Welcome, ${user.name}`,
           paragraphs: ['Your account is ready.'],
           action: { label: 'Open the app', url: `${appUrl}/items` },
           footer: ['You get this message because an account was created with this address.'],
         },
         product,
       );
     },
   };
   ```

   `compose` runs in a short transaction when the message is sent: read what the message is about
   there, and return `null` when it no longer applies. A link that carries a secret mints it there
   too (store only its hash; put the token after `#` so it never reaches a server log). Links are
   built from `appUrl` (`APP_ORIGIN` + `APP_BASE_PATH`: the addresses the app claims), never from a
   request; the screen a link opens must be one the app accepts (`apps/mobile/src/lib/links.ts`;
   `scripts/web-server-routes.test.mjs` checks every email's links). `renderMail` escapes every
   value.

3. **Queue it** with the change, then wake the worker after the commit:

   ```ts
   await this.prisma.$transaction(async (tx) => {
     const user = await tx.user.create({ data: { ... } });
     await this.mail.enqueue(tx, { kind: 'welcome', to: user.email, userId: user.id });
   });
   this.mail.notifyQueued();
   ```

   `enqueue` answers `queued`, `duplicate` (same `dedupeKey`), `suppressed` (the per-address
   limits) or `disabled` (email off): never tell a client which, or it learns whether an address
   has an account.

4. **Tests:** the template's unit spec (escaping, `null` when it no longer applies); an
   integration spec that queues it and reads it back from Mailpit (`apps/api/test/mailpit.ts`);
   a Maestro flow of the stack suite for a flow a person follows from the message
   (`apps/mobile/.maestro/stack/`, the helper `helpers/open-emailed-link.yaml`).

## Add a metric and an alert

1. **The metric**, with low-cardinality attributes only (never user ids, emails or raw paths): the
   instrument and its `record...` function in `apps/api/src/observability/metrics.ts`, called where
   the event happens.
2. **The catalog:** its entry in `observability/api-metrics.json` under its Prometheus name (dots
   become underscores, the unit and `_total` become suffixes), with its type and attribute keys;
   call the `record...` function in `apps/api/src/observability/metrics-catalog.spec.ts` with every
   attribute set. `pnpm --filter api test` passes when the code, the spec and the catalog agree
   ([observability.md](observability.md#metric-catalog)).
3. **A panel**, if someone should watch it: in `observability/grafana/dashboards/api-service.json`,
   reading the data source through `${datasource}` and filtering by `$job` and `$environment` like
   the other panels.
4. **An alert**, if it should wake someone or reach the team: a rule in
   `observability/prometheus/rules/api-alerts.yaml` with `severity` (`critical` or `warning`),
   `summary`, `description`, `runbook_url` (a section of
   [incident-response.md](incident-response.md), written first) and `dashboard_uid`; a unit test in
   `observability/prometheus/tests/api-alerts.test.yaml` that makes it fire, and one for what it
   must not fire on; its row in [observability.md](observability.md#alerts) and
   [alerting.md](alerting.md#alert-catalog).
5. **Check:** `pnpm observability:check` (Docker): the catalog, the runbook, the dashboard and
   promtool on the rules and their tests.

## Add a screen to the app

The steps of [mobile-architecture.md](mobile-architecture.md#adding-a-feature), with the items
feature as the model:

1. **The API and the contract** first, when the screen needs data the API does not serve yet
   ([Add an API module](#add-an-api-module), [Change the API contract](#change-the-api-contract)).
2. **The data hooks** in `apps/mobile/src/features/<feature>/api.ts`: query keys in one factory, a
   Zod schema per response that `satisfies` its generated type, and one hook per query or mutation,
   through `api` from `@/api/client` and `unwrapWith(..., Schema)`. Never `fetch` (a lint rule),
   never server data copied into Zustand or React state.

   ```ts
   export type Note = components['schemas']['Note'];

   export const NoteSchema = z.object({
     id: z.string().min(1),
     title: z.string(),
     createdAt: z.iso.datetime({ offset: true }),
   }) satisfies z.ZodType<Note>;

   export const noteKeys = {
     all: ['notes'] as const,
     detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
   };

   export function useNote(id: string) {
     return useQuery({
       queryKey: noteKeys.detail(id),
       queryFn: ({ signal }) =>
         unwrapWith(api.GET('/api/notes/{id}', { params: { path: { id } }, signal }), NoteSchema),
     });
   }
   ```

3. **The screen**, `apps/mobile/src/features/<feature>/<Name>Screen.tsx`: components from
   `@/ui` only (`Text`, `Button`, `TextField`...), theme values only, every control with a role and
   a label, the loading, empty, error and offline states (`EmptyState`, `ErrorState`, `AlertText`
   for messages that appear without navigation).
4. **The route**, a thin file in `apps/mobile/src/app/` that validates its parameters and renders
   the screen (`apps/mobile/src/app/(app)/items/[id].tsx`). A route that needs a role goes behind a
   `Stack.Protected` guard; navigation after a sign-in or sign-out is the guards' job, never the
   screen's.
5. **Tests:** the hooks and logic (unit); the screen through the stubbed API, queried by role and
   label (`<name>.int.spec.tsx`, as `features/items/items.int.spec.tsx`); the screen's states in
   `apps/mobile/src/a11y.spec.tsx` (every new screen goes there); the mock API's routes; a Maestro
   flow when it is a critical journey ([Add an end-to-end flow](#add-an-end-to-end-flow)).
6. **Check:** `pnpm verify`, then the screen on Android and iOS, light and dark, the largest font
   size, TalkBack and VoiceOver, offline ([accessibility.md](accessibility.md)).

## Add a deep link

Links are untrusted input: a path is accepted only when `apps/mobile/src/lib/links.ts` lists it,
and a link never performs an action by itself (it opens a screen; the user acts).

1. A route in `ROUTES` of `apps/mobile/src/lib/links.ts`: a literal pattern, what it opens, and its
   https form below `/app` (`appLink`), which also becomes an Android App Links path
   (`APP_LINK_PATHS`, read by `apps/mobile/app.config.ts`). iOS takes the paths from the domain's
   `apple-app-site-association`, which claims `/app/*` already.
2. Its test in `apps/mobile/src/lib/links.spec.ts`: accepted, and the near misses refused.
3. A link an email carries: built by the API from `APP_ORIGIN` + `APP_BASE_PATH`, its token after
   `#`, and listed in `LINK_TOKEN_SCREENS` when it carries one
   ([mobile-architecture.md](mobile-architecture.md#deep-links));
   `scripts/web-server-routes.test.mjs` fails when an email links to a screen the app does not
   accept, or a token screen of the app has no email.
4. Android's intent filters are native configuration: a new App Links path needs a new build
   (`pnpm prebuild`, then a store build), not an OTA update.

## Ask for a permission or add a native module

1. **Is it needed?** An Expo SDK module first, then a maintained library that supports the New
   Architecture ([React Native Directory](https://reactnative.directory)); install it with
   `pnpm --filter mobile exec expo install <package>` ([Add a dependency](#add-a-dependency)).
2. **Native configuration** in `apps/mobile/app.config.ts` and config plugins, never in
   `android/` or `ios/` (generated, never committed): the module's plugin, and for a permission its
   usage text (`ios.infoPlist`, the plugin's options), which the stores show and review.
3. **Ask in context:** from the screen that needs it, after saying why, through `usePermission`
   (`apps/mobile/src/lib/permissions/usePermission.ts`) and `PermissionPrompt`, never at launch; a
   blocked permission opens the system settings. Settings' notifications are the example.
4. **Release impact:** a new native module or permission needs a new development build
   (`pnpm prebuild`, `pnpm android` / `pnpm ios`) and a new store build; mark it in the pull
   request. The store declarations (privacy labels, Data safety) follow
   ([store-compliance.md](store-compliance.md)).

## Ship code behind a feature flag

1. Declare it in `FLAGS` of `apps/mobile/src/lib/flags/index.ts`, with its default and a
   description of why it exists ([mobile-architecture.md](mobile-architecture.md#feature-flags)).
2. Read it with `isEnabled('<name>')` where the feature starts (the items screen reads
   `newItemForm` this way); test both values.
3. Try it in development and preview builds with `EXPO_PUBLIC_FLAGS=name=true`.
4. Remove the flag and the dead branch once the feature is on for everyone: a flag is temporary.

## Track an analytics event

1. Declare the event and its properties in `AnalyticsEvents` of
   `apps/mobile/src/lib/analytics/types.ts`: ids and enums only, never personal data.
2. `analytics.track('<event>', { ... })` where it happens. Nothing is sent before the user's
   consent (Settings → Privacy), and nothing at all until a provider is configured in
   `apps/mobile/src/lib/analytics/providers.ts`.
3. The store declarations (Data safety, privacy labels) and the data inventory
   ([SECURITY.md](../SECURITY.md#data-inventory)) list what the provider receives.

## Add an end-to-end flow

End-to-end flows cover critical journeys only (sign-in, the main thing users come for);
everything else is cheaper as component or integration tests ([testing.md](testing.md)).

- **The app (Maestro):** a flow in `apps/mobile/.maestro/flows/` against the mock API (the
  "mock" suite, every pull request that touches the app), or a journey of the stack suite in
  `apps/mobile/.maestro/stack/` against the real API and Mailpit, for a flow that goes through an
  email (`helpers/open-emailed-link.yaml`). Select by accessibility label or `testID`, never by
  text a translation would change. Run it with `pnpm test:e2e:mobile` (or
  `pnpm test:e2e:mobile:stack`) on a running emulator or simulator with the e2e build
  ([testing.md](testing.md#end-to-end)).
- **The landing and the web image (Playwright):** a file in `e2e/` ending in `.e2e.ts`;
  `landing.e2e.ts` runs against the built landing, `app-links.e2e.ts` against the web image built
  from its Dockerfile. Run them with `pnpm build && pnpm test:e2e`
  ([testing.md](testing.md#browser-end-to-end)).

## Change the landing

The landing (`apps/landing`) is the public site: static pages built by Astro and styled with
Tailwind CSS, in English at `/` and in Spanish at `/es/`. It is HTML and CSS only: no script in the
browser, no inline `style`, nothing loaded from another origin, so the strict
Content-Security-Policy of the web image (`apps/landing/nginx/security-headers.conf`) needs no
exception for it. Run it with `pnpm dev` (or `pnpm --filter landing dev`) at http://localhost:4331.

- **A text.** Every text lives in `apps/landing/src/i18n/en.ts` and `es.ts`, in the shape
  `messages.ts` declares. Change both languages in the same commit. A new text goes into
  `messages.ts` first: the site does not compile until both dictionaries have it, and
  `pnpm --filter landing test` fails on an empty text, stray spaces or English left in the Spanish
  dictionary.
- **The product's name.** `SITE_NAME` in `src/lib/site.ts`; the icon is `public/favicon.svg`, and
  the picture a shared link shows is `public/og.png`, with the name drawn in it: replace it with the
  product's, at 1200 × 630 (`SHARE_IMAGE` in the same file; a spec checks the size).
- **The look.** Colours (each with its light and dark value), the five type sizes and the motion
  live in `src/styles/global.css`; components use them through Tailwind classes (`bg-ground`,
  `text-ink`, `text-display`). Keep body text in the full ink and contrast at 4.5:1 or more.
  `pnpm lint` checks the classes against that stylesheet: an unknown, duplicate or conflicting class
  fails, and so does an order other than Tailwind's, which `pnpm lint:fix` and the pre-commit hook
  write. A new motion class, kept outside `@layer components` like the others, is listed in
  `eslint.config.mjs`.
- **A section.** A component in `src/components/` that takes `locale` and reads its texts with
  `messages(locale)`, added to `Home.astro`. Give it a heading (`h2`, named by `aria-labelledby`
  on the section) and the `reveal` class on the parts that should arrive as it scrolls in.
- **A page.** One file per language, both rendering one shared component, as the home page does:
  `src/pages/pricing.astro` (`/pricing/`) and `src/pages/es/pricing.astro` (`/es/pricing/`). The
  component passes `path="/pricing/"` (its address in the default language) to `Base`, which writes
  its canonical and alternate links; the sitemap lists it. Link to it with
  `localePath(locale, '/pricing/')`.
- **A language.** Its code in `src/i18n/locales.ts`, its dictionary next to `en.ts` (registered in
  `src/i18n/index.ts`), its pages under `src/pages/<code>/`, its not-found page as
  `src/pages/<code>/404.astro`, and its line in the `$landing_not_found` map of
  `apps/landing/nginx/default.conf.template` (`scripts/web-server-routes.test.mjs` checks they
  agree). Routing, the sitemap and the alternate links follow `LOCALES`.
- **The app's links.** `/app/*` is the app's (`APP_LINKS_PATH` in `src/lib/links.ts`): never put a
  landing page there. The open-in-app page answers those addresses
  ([ADR 0008](adr/0008-public-site-and-app-links.md)); the stores' badges come from
  `src/lib/stores.ts`.
- **A picture.** Vector images (SVG) work as they are. Raster images would need an optimizer
  (sharp), which `pnpm-workspace.yaml` keeps out because its binaries are LGPL: put a WebP or AVIF
  in `public/` with its `width`, `height` and `alt`. A picture of the app is drawn in HTML, in
  `src/components/fragments/`, with `data-ui`, `role="img"` and a label in each language.
- **A script.** There is none: `apps/landing/performance-budget.json` holds JavaScript at 0 kB.
  A script that becomes necessary must reach the page as a file of this origin, never inline (the
  Content-Security-Policy refuses inline scripts: check the built HTML), and its budget is raised
  in the same reviewed pull request.

Check: `pnpm --filter landing test`, `pnpm verify` and `pnpm build && pnpm test:e2e`
(`e2e/landing.e2e.ts` covers both languages, the 404 and the sitemap).

## Add an environment variable

**The API:**

1. Declare it in `apps/api/src/env/env.schema.ts` with its type, default and rules, and a comment
   saying what it is for:

   ```ts
   // Notes one user may keep (protects the database from a single account).
   NOTES_MAX_PER_USER: emptyAsUnset(z.coerce.number().int().positive().default(1000)),
   ```

   Numbers and booleans arrive as strings: use `z.coerce.number()` or the schema's `flag`, and wrap
   a value with a default in `emptyAsUnset(...)`: an empty `NOTES_MAX_PER_USER=` then means the
   default, not the 0 `z.coerce.number()` makes of it. A value required only in production: make it
   optional and add the check in `superRefine` (see `TRUST_PROXY`).

2. Use it through the validated module: `import { env } from '../env/env.js'` then
   `env.NOTES_MAX_PER_USER`. Reading `process.env` is a lint error.
3. Add it to `apps/api/.env.example` (commented out when it has a default) with one line of
   explanation, to the table in [environment.md](environment.md#api-variables), and to
   `deploy/vps/api.env.example` when a deployment sets it.
4. Test the rules in `apps/api/src/env/env.schema.spec.ts` (default, and one invalid value). If
   the test suites need a fixed value, set it in `test.env` of `apps/api/vitest.config.ts` or
   `vitest.config.int.ts`.
5. Deployment: add it to each server's `api.env` (secrets never in a committed file). A new
   **required** variable stops the API at boot until it is set: set it first, then deploy.

**The app:** `apps/mobile/src/config/env.schema.ts` (its schema), its line in
`apps/mobile/src/config/env.ts`, `apps/mobile/.env.example`, and
[releases.md](releases.md#environment-variables); then the EAS environments
(`eas env:create --environment <name> ...`). An `EXPO_PUBLIC_*` value is compiled into the app and
readable by anyone who has it: never a secret.

**The web image:** a runtime setting checked by `apps/landing/nginx/18-validate-runtime-config.sh`
(and its test), declared in `apps/landing/Dockerfile`, listed in
[environment.md](environment.md#web-variables) and in `deploy/vps/web.env.example`
(`scripts/deploy-vps.test.mjs` checks that the file names only what the image reads).

## Add a dependency

1. Add it to the package that uses it, never to the root unless it is repository tooling:

   ```
   pnpm --filter mobile exec expo install <package>   # the app: the version its Expo SDK expects
   pnpm --filter api add <package>
   pnpm --filter landing add -D <package>
   pnpm add -D -w <package>                           # repository tooling only
   ```

   For the app, an Expo SDK module first, then a maintained library that supports the New
   Architecture; one with native code needs a new build
   ([Ask for a permission or add a native module](#ask-for-a-permission-or-add-a-native-module)).

2. Justify it in the pull request: maintained, license, size (the bundle budgets will tell), no
   simpler alternative. `pnpm deps:check` fails on a license outside `scripts/dependency-policy.json`
   (production dependencies need a permissive one) and on a package from a git repository or a URL
   instead of the registry ([SECURITY.md](../SECURITY.md#dependency-policy)).
3. **Install scripts:** if the package runs one, pnpm reports it as ignored. Decide in
   `allowBuilds` of `pnpm-workspace.yaml`, with the reason; `true` also needs the reviewed exception
   in `scripts/dependency-policy.json`, or `pnpm deps:check` fails.
4. **Brand-new versions:** a version published less than seven days ago is refused
   (`ERR_PNPM_NO_MATURE_MATCHING_VERSION`). Wait, or, for an urgent security fix only, exempt that
   exact version in `minimumReleaseAgeExclude`, with its expiry date and the advisory. A package
   whose own dependencies come from a git repository or a tarball URL is refused too
   (`blockExoticSubdeps`), and so is a version published with weaker evidence than its
   predecessors (`trustPolicy`): pick another version, and report it upstream if it looks like a
   takeover.
5. `pnpm expo:doctor` (for the app), `pnpm security` and `pnpm verify`. Commit `package.json`,
   `pnpm-lock.yaml` and, if it changed, `pnpm-workspace.yaml`.

## Run with or without Redis

Redis is on in development: `pnpm services:up` (and `pnpm dev`) starts it with the database, on
127.0.0.1:6399 with the password `app`, and `apps/api/.env.example` points the API at it with the
shared rate limits, the shared cache and a readiness that requires it, as on the reference server.

1. Check: the `pnpm dev` box shows Redis, the API logs `Redis connected` and readiness shows
   `"redis": "ok"`. `docker compose stop redis` shows the degraded mode, `docker compose start
redis` the recovery.
2. Without Redis: remove `REDIS_URL`, `RATE_LIMIT_STORE`, `CACHE_STORE` and `REDIS_REQUIRED` from
   `apps/api/.env`. The in-process stores take over (one instance only), and the Redis integration
   specs are skipped.
3. Another port or password: `REDIS_PORT` and `REDIS_PASSWORD` in the root `.env`, and the same in
   `REDIS_URL`.
4. Production: the reference server runs its own Redis with an ACL user
   ([deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)). Elsewhere, or for more than one
   server: a private Redis with TLS and an ACL user, `REDIS_URL=rediss://...` from the secret store,
   `REDIS_KEY_PREFIX` per environment ([security.md](security.md#redis)). `REDIS_REQUIRED=true` only
   where the application must not run without it.

## Turn on error tracking

1. Create two Sentry projects: one for the API (Node.js), one for the app (React Native).
2. The API: `SENTRY_DSN` in each server's `api.env`, `APP_ENVIRONMENT` set. The app:
   `EXPO_PUBLIC_SENTRY_DSN` in each EAS environment, and `SENTRY_ORG`, `SENTRY_PROJECT` and
   `SENTRY_AUTH_TOKEN` for the source maps ([releases.md](releases.md#environment-variables),
   [ci-cd.md](ci-cd.md#secrets-and-variables)).
3. Deploy images built by CI (their release is the commit SHA) and builds and updates made by the
   workflows (their release, build and update id tag every event).
4. Check: the API logs `error tracking on` at boot; a test error from a preview build appears with
   a readable stack trace. Then set alert rules in Sentry for both projects
   ([alerting.md](alerting.md#alert-catalog)).

## Turn on tracing and metrics

1. Try it locally: `docker compose --profile observability up -d`, then
   `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4328` in `apps/api/.env` and restart `pnpm dev`;
   Grafana at http://localhost:3011 (Dashboards → Application, Alerting, Explore: Tempo,
   Prometheus).
2. Deployed: `OTEL_EXPORTER_OTLP_ENDPOINT` of your collector or provider, its credentials in
   `OTEL_EXPORTER_OTLP_HEADERS` (the server's `api.env`), a sampler
   (`OTEL_TRACES_SAMPLER=parentbased_traceidratio`, `OTEL_TRACES_SAMPLER_ARG=0.1`),
   `APP_ENVIRONMENT`.
3. Import the dashboards and load the alert rules of `observability/` into your backend, and route
   the alerts by severity ([observability.md](observability.md#use-them-with-your-backend)).
4. Kill switch: `OTEL_SDK_DISABLED=true`.

## Pull changes from the team

After `git pull` (or switching branches):

| Changed                                                                       | Run                                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm-lock.yaml`                                                              | `pnpm install`                                                             |
| `apps/api/prisma/migrations/`                                                 | `pnpm db:migrate` (applies them, regenerates the client)                   |
| `openapi/openapi.json`                                                        | nothing: the generated types come in the same commit                       |
| `apps/api/.env.example`, `apps/mobile/.env.example`                           | copy new variables into your `.env` files                                  |
| native configuration (`apps/mobile/app.config.ts`, a module with native code) | `pnpm prebuild`, then `pnpm android` / `pnpm ios`: a new development build |

`pnpm dev`, `pnpm lint`, `pnpm typecheck` and the test commands regenerate the Prisma client and
Expo's types; if the editor still shows old types, run "TypeScript: Restart TS Server".

## Raise coverage thresholds or a budget

- **Coverage:** when a pull request raises coverage, raise the thresholds in
  `apps/mobile/jest.config.js`, `apps/api/vitest.config.ts` and `apps/landing/vitest.config.ts` to
  the new values, rounded down, in the same pull request. When new code lowers coverage below the
  floor, the gate fails: add the missing tests (usually error paths and every service method).
  Lowering a threshold needs a reviewed reason ([testing.md](testing.md#coverage)).
- **Budgets:** the app's bundle (`apps/mobile/bundle-budget.json`) and the landing's
  (`apps/landing/performance-budget.json`). Before raising the app's, look for the heavy dependency
  or the code that could load later ([performance.md](performance.md)); the landing's JavaScript
  budget of 0 kB is a decision, not a measurement.

## Add another app or a background worker

See [architecture.md](architecture.md#extending): a new folder in `apps/` with its own
`package.json` (the workspace and the root commands pick it up), a tsconfig extending
`tsconfig.base.json`, `typecheck`/`test`/`build` scripts, and its own Dockerfile. Add its image to
`.github/workflows/docker-images.yml`, and to `deploy.yml` and `deploy/vps/compose.yaml` if the
server runs it. Code outside `apps/` that an image needs (a shared `packages/` folder) must also be
added to the allowlist in `.dockerignore`. A background worker fed by a job queue follows the
integration point in [architecture.md](architecture.md#job-queues): same observability setup and
shutdown sequence, idempotent jobs, ids (not personal data) in payloads.
