# Database

PostgreSQL 18 through Prisma 7 (`apps/api/prisma/schema.prisma`), driver adapter
`@prisma/adapter-pg`, client generated into `apps/api/src/prisma/generated` (ignored by git,
generated on install and build). The Prisma CLI reads `apps/api/prisma.config.ts`: the schema, the
migrations folder (`apps/api/prisma/migrations`) and `DATABASE_URL`, from the environment or from
`apps/api/.env` (the CLI does not read `.env` by itself; a variable already set wins).

## Local database

```
pnpm db:up                         start PostgreSQL 18 alone (docker compose, service db) on
                                   127.0.0.1:5452; `pnpm dev` starts it too, with Redis and Mailpit
pnpm db:migrate --name <name>      create a migration from the schema changes, apply every pending
                                   one, regenerate the Prisma client (asks for a name if omitted)
pnpm db:seed                       development accounts and example items (Seeds, below)
pnpm db:down                       stop the project's containers (docker compose down); the data
                                   stays in the db_data volume
```

`DATABASE_URL` in `apps/api/.env` points at it: `postgresql://app:app@localhost:5452/app` (from
`apps/api/.env.example`). The port is the web template's 5442 plus 10, so both templates run on one
machine; `DB_PORT` in a root `.env` moves it (then change `DATABASE_URL` to match). The credentials
are for this machine only, and the port is published on loopback only.
`docker compose down --volumes` deletes the data too.

## Conventions

- **Names:** models `PascalCase` singular, fields `camelCase`; tables and columns `snake_case`
  through `@@map("users")` / `@map("created_at")`.
- **Keys:** `id String @id @default(uuid(7)) @db.Uuid` (time-ordered UUIDv7, good index locality,
  not guessable). Foreign keys `@db.Uuid` too, always indexed (`@@index([userId])`).
- **Time:** `DateTime @db.Timestamptz(3)`, stored in UTC. Every table has `createdAt`; tables
  edited in place have `updatedAt @updatedAt`.
- **Enums** for closed sets the code switches on (`Role`, `MailKind`). Keep the TypeScript list in
  sync (a spec checks `ROLES`). Adding a value is an expand step (`ALTER TYPE ... ADD VALUE`).
- **Uniqueness and normalization:** unique columns hold normalized values (emails trimmed and
  lowercased before every write and lookup).
- **Deletes:** choose `onDelete` deliberately for every relation: `Cascade` for owned rows
  (sessions, items, one-time tokens, a user's queued messages), `Restrict` for referenced records,
  `SetNull` for optional pointers (`invitations.invited_by_id`, `sessions.replaced_by_id`). Deleting
  an account relies on these cascades
  ([adr/0012-account-deletion.md](adr/0012-account-deletion.md)).
- **Constraints Prisma cannot express** (CHECK, partial unique indexes) go as raw SQL in the
  migration, with a comment in the schema (the outbox's states, token hashes, expiries).
- **Money** as integer minor units (`amountCents Int`) or `Decimal`, never `Float`.
- **Personal data:** know which columns hold it; select it only where needed (`USER_SELECT`), never
  log it.

## Migrations

```
pnpm db:migrate --name <name>      create a migration from the schema changes, apply every pending
                                   one, regenerate the Prisma client (asks for a name if omitted)
pnpm --filter api db:deploy        prisma migrate deploy: apply pending migrations (without the
                                   checksum check of the api-migrate image, below)
```

`pnpm db:migrate` (`apps/api/scripts/migrate.mjs`) regenerates the client on purpose: Prisma 7's
`migrate dev` no longer does, and the code would keep compiling against the old models. `pnpm dev`,
`pnpm lint`, `pnpm typecheck` and the test commands also regenerate it before running.

The migrations, in order:

| Migration                               | What it changes                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261003050918_init`                   | `Role` enum; `users`; `sessions` (refresh token families: `family_id`, `family_expires_at`, `token_hash`, `revoked_at`, `rotated`), deleted with their user                                                                                                                                                               |
| `20261013000421_add_mail_outbox`        | `MailKind` (`test`) and `MailStatus` enums; `mail_messages`, the outbox, with CHECK constraints for its states                                                                                                                                                                                                            |
| `20261013005913_add_password_recovery`  | `users.security_version`; `account_tokens` (one-time link tokens, `password_reset`); `MailKind` `password_reset`, `password_changed`                                                                                                                                                                                      |
| `20261013020841_add_sign_up`            | `sign_ups` (sign-ups waiting for their address to be confirmed); `MailKind` `sign_up_confirmation`, `sign_up_existing`                                                                                                                                                                                                    |
| `20261013023843_add_email_change`       | `account_tokens.target_email`; purposes `email_change`, `email_revert`; `MailKind` `email_change_confirmation`, `email_change_existing`, `email_changed`                                                                                                                                                                  |
| `20261013030755_add_invitations`        | `invitations` (`invited_by_id` set to null when the inviter is deleted); `MailKind` `invitation`                                                                                                                                                                                                                          |
| `20261021190000_add_session_rotation`   | `sessions.replaced_by_id` (unique, the session a rotation created, set to null when that one is deleted) and `sessions.superseded`: the 30-second reuse window of renewals                                                                                                                                                |
| `20261021190100_add_items`              | `items`, the example resource: owner (deleted with it), `title` up to 120, `description` up to 2000, `idempotency_key` and `request_hash`; unique `(owner_id, idempotency_key)`; index `(owner_id, created_at DESC, id DESC)`                                                                                             |
| `20261021190200_add_account_deletion`   | `MailKind` `account_deleted`, the notice sent when an account is deleted                                                                                                                                                                                                                                                  |
| `20261022051210_add_push_notifications` | `DevicePlatform`, `PushTokenKind`, `PushKind` (`password_changed`) and `PushStatus` enums; `devices` (one per installation and one per push token, deleted with their user) and `push_messages`, the push outbox (deleted with their user or device), with CHECK constraints for the token's form and the outbox's states |

Rules:

- Every schema change ships as a **committed migration** in the same pull request as the code.
- **Never edit a migration that reached `main`**; fix forward with a new one. Prisma's
  `migrate deploy` compares migrations by name only: it would skip an edited migration as already
  applied, and that database would keep a schema every new one (CI, a new environment, a restore
  into an empty database) does not have. So the `api-migrate` image's command
  (`apps/api/scripts/migrate-deploy.mjs`) first compares the checksum Prisma recorded for each
  applied migration with the file it ships, and stops before migrating anything when one differs:
  `Migrations changed after they were applied to this database: <names>`. When it does, restore the
  file as it was applied (from git history) and ship the change as a new migration. Attempts marked
  rolled back (`prisma migrate resolve --rolled-back`) and failed ones are left to Prisma.
- Review the generated SQL: locks on large tables, defaults, data loss warnings.
- The `api-migrate` image (`apps/api/Dockerfile`, target `migrate`) runs `prisma migrate deploy`
  through that script. A deployment runs it **before** the new API version takes traffic; the local
  stack does the same (`docker compose --profile stack up --build`: the `migrate` service completes
  before `api` starts), and CI builds and scans the image (never pushed). `migrate dev` and
  `migrate reset` are for development only.
- **One migration run at a time.** `prisma migrate deploy` holds a PostgreSQL advisory lock while
  it runs (Prisma 7's schema engine, `pg_advisory_lock(72707369)`): a second run against the same
  database waits up to 10 seconds, then fails with `P1002`
  (`Timed out trying to acquire a postgres advisory lock`) without applying anything. The lock
  belongs to the database session, so the migration job connects to the database directly, never
  through a pooler in transaction mode (PgBouncer, a provider's connection pool), which would share
  the session with others.
- **The engine and its network.** The schema engine connects to the database itself: with
  `sslmode=require`, over TLS without checking the certificate, as libpq's `require` does. The
  `api-migrate` image installs Debian's `libssl3`, so Prisma chooses the engine built for OpenSSL 3,
  which links that library: patched with the image, seen by its scan. Without it Prisma guesses
  OpenSSL 1.1, says so at every run (`Prisma failed to detect the libssl/openssl version`), and uses
  an engine with its own copy of OpenSSL; the image build stops instead. The CLI's update check and
  usage data are off in the image, its builds and CI (`CHECKPOINT_DISABLE=1`); set the same in your
  shell to keep it quiet locally.

### Expand and contract

Old and new API versions run side by side during a rollout, and a rollback runs the old version on
the new schema. So every migration must be compatible with the version before it:

1. **Expand:** add nullable columns or new tables; backfill; write to both old and new.
2. Deploy the code that reads the new shape.
3. **Contract:** in a later release, drop the old column or constraint.

Renames are add + copy + drop across releases, never a single `RENAME`. The three newest migrations
are expand steps: the release before them ignores the new columns, never reads the new table and
never writes the new enum value.

Nothing at run time notices a contract step that came too early: readiness asks the database for
`SELECT 1` only. After a migration that drops a column the previous release still reads, readiness
passes while every request that reads the column answers 500. So a contract step must say why it is
safe, in a comment right above the statement:

```sql
-- contract: release 1.4.0 stopped reading users.name, and every server runs it
ALTER TABLE "users" DROP COLUMN "name";
```

`scripts/check-migrations.mjs` refuses a contract step without that reason; it runs in
`pnpm test:scripts` (so in CI) and on the migrations staged at each commit
(`lint-staged.config.mjs`). Contract steps:

- dropping a table, column, type or view; renaming a table, column, type or enum value; changing
  a column's type; making a column required (`SET NOT NULL`, or a `NOT NULL` table constraint,
  PostgreSQL 18), adding a required column without a default, or removing a default; emptying a
  table;
- in the migrations from `TIGHTENING_FROM` on (the ones before it shipped before these rules, and
  a committed migration is never edited), also:
  - a unique index or a constraint (`CHECK`, `UNIQUE`, `PRIMARY KEY`, `FOREIGN KEY`, `EXCLUDE`, in
    the table or in a column's definition) added to a table an earlier migration created: the
    previous release may write what it refuses, and existing rows can make it fail. Exempt: a
    unique index, a `UNIQUE` or a foreign key that only covers columns the same migration added
    empty (a new optional relation): nullable, with no default (nor one given later with
    `SET DEFAULT`), not typed with a domain (its default is the domain's, now or later), no
    generated or identity value, not added with `IF NOT EXISTS` (the column may be there already),
    and no `UPDATE`, `INSERT`, `MERGE` or `COPY ... FROM` of that table in the migration, one inside
    a `WITH` query, a `COPY (...) TO`, an `EXPLAIN`, a `PREPARE` or a rule included. Never exempt:
    `NULLS NOT DISTINCT` (the NULLs collide), a `CHECK` (it may read other columns) and a primary
    key (it refuses NULLs). A table made with `CREATE TABLE IF NOT EXISTS` may be there already,
    with its rows: it counts as an earlier migration's;
  - a foreign key, in any table (new ones included), to a table an earlier migration created that
    does not give way to it (`ON DELETE` and `ON UPDATE` each `CASCADE`, or `SET NULL` or
    `SET DEFAULT` putting NULL in columns that take it): the previous release's deletes of the rows
    it references would be refused. The columns are judged as the whole migration leaves them: one
    that is `NOT NULL` (in its definition, by `SET NOT NULL` or a `NOT NULL` table constraint), in
    a primary key (one taken `USING INDEX` too), an identity, read by a `CHECK` or typed with a
    domain may refuse the NULL (Prisma only warns about `onDelete: SetNull` on a required
    relation), and a `SET DEFAULT` to a default of the column's own names a row the check cannot
    see. Prisma writes `ON DELETE RESTRICT` for a required relation: give it `onDelete: Cascade`
    (or make it optional, `SET NULL`), or write why the previous release never deletes those rows;
  - a dropped unique index (every name of a `DROP INDEX`), unique constraint or primary key; a
    table moved to another schema; a `DELETE` without `WHERE`; an enum value added without
    `IF NOT EXISTS` (see below).

Comments and strings anywhere in a statement do not hide a step. Prisma writes `ADD VALUE` without
`IF NOT EXISTS`, and `pnpm db:migrate` applies what it creates: create such a migration with
`pnpm db:migrate --name <name> --create-only`, write `ADD VALUE IF NOT EXISTS` in its SQL, then run
`pnpm db:migrate` to apply it (editing a migration already applied to your database makes
`migrate dev` ask to reset it). A Prisma change that removes an enum value writes several of
them (retype the column, rename the types, drop the old one), each with its reason. Removing the
example `items` table, once a project's own features replace it, is a contract step too. Expand
steps (new tables and what they get in the same migration, nullable columns, columns with a
default, indexes, looser constraints) need nothing, except a foreign key that does not give way to
an existing table. The check reads plain statements, not SQL inside a `DO` block, a function or
procedure body (a `CALL`, a `SELECT` of a function, a trigger) or a dynamic statement.

### Safe migrations

- **Small:** one change per migration, so a failure leaves at most a known part applied.
- **Bounded locks:** start a migration that alters a busy table with `SET lock_timeout = '5s';`:
  it fails fast instead of queueing every request behind its lock
  (`20261021190000_add_session_rotation` on `sessions`, `20261021190100_add_items` for its foreign
  key to `users`).
- **Large tables:** build indexes with `CREATE INDEX CONCURRENTLY` in a migration of their own (it
  cannot run inside a transaction); backfill in batches, not in one statement. A CHECK constraint on
  a large table goes in `NOT VALID`, then `VALIDATE CONSTRAINT`, which does not block reads or
  writes meanwhile (`20261013005913_add_password_recovery` does so on `users`).
- **Rehearse** anything that rewrites data or locks a large table against a restored copy of
  production.

### When a migration fails

Prisma runs a migration's SQL **without a transaction** on PostgreSQL: when a statement fails, the
ones before it stay applied (checked with Prisma 7.10 and PostgreSQL 18). The migration is recorded
as failed (`P3018`), and every later `migrate deploy` refuses to run (`P3009`) until it is resolved.
Because the migration runs before the rollout, the running version keeps serving.

1. Find what took effect: `prisma migrate status` (in an environment: the `api-migrate` image with
   that command), the error in the job's output, and the tables the migration touches.
2. Undo those statements (or, as a last resort, apply the rest by hand). An enum value cannot be
   undone (PostgreSQL has no `DROP VALUE`): it stays, which the migration's rerun survives only when
   it adds it with `ADD VALUE IF NOT EXISTS` (the check above asks for it). The migrations committed
   before that rule add theirs without it: if one of them fails after its `ADD VALUE` statements,
   finish it by hand and record it `--applied`.
3. Record the outcome: `prisma migrate resolve --rolled-back <migration>` (undone) or
   `--applied <migration>` (completed by hand). Never edit `_prisma_migrations` directly.
4. Fix the data or the migration and deploy again.

Wrapping a migration in `BEGIN;` ... `COMMIT;` makes it atomic (nothing is applied on failure), at a
cost: Prisma then reports `current transaction is aborted` instead of the failing statement, which
has to be found in the database's log. Statements that cannot run in a transaction
(`CREATE INDEX CONCURRENTLY`) cannot be wrapped.

## Test databases

The integration specs (`pnpm test:integration`, with the services up: `pnpm services:up`) run
against `<db>_test` on the same server as `DATABASE_URL` (`app_test` locally): created when
missing and brought to the current schema with `prisma migrate deploy` before the suites
(`apps/api/test/global-setup.ts`), emptied by the suites (`resetDatabase`, every table but
`_prisma_migrations`). The spec of `migrate-deploy.mjs` uses a database of its own
(`<db>_test_migrate_guard`). The development database is never touched by tests. Before the
integration suite, its setup also replays every migration on an empty `<db>_shadow`, as
`prisma migrate dev` does on its shadow database, and compares the result with `schema.prisma`
(`prisma migrate diff --exit-code`): a migration that only runs where a deployment created
something first (`_prisma_migrations`, a role), or a schema change without its migration, fails
there instead of on a developer's machine. In CI, the integration job runs PostgreSQL 18 as a service container.

## Seeds

`apps/api/src/seed/seed.ts`, run by `pnpm db:seed`, is idempotent (users upserted by email, items by
their fixed ids; a re-run resets them, and items created since stay):

- `admin@example.com` / `admin-password` (admin) and `member@example.com` / `member-password`
  (member);
- 45 items for the member, `Item 1` to `Item 45` ("Example item number N."), created hourly from
  2026-01-01T00:00Z (`Item 45` is the newest), with fixed ids
  `00000000-0000-7000-8000-0000000000NN`: the same items the mock API serves
  (`apps/mobile/scripts/mock-api.mjs`), so the app shows the same list against either.

Its accounts have public passwords, so `pnpm db:seed` refuses `NODE_ENV=production` and any database
whose host is not this machine (`localhost`, `127.0.0.1`, `::1`), the URL's `host` and `hostaddr`
parameters included; for a disposable remote database, pass `pnpm db:seed --allow-remote-database`.
Production data comes from the product's own flows or an audited script, never from the seed.

## Sessions

The `sessions` table holds one row per refresh token, only its SHA-256, grouped in families: every
sign-in starts a family of its own (`family_id`, `family_expires_at`, 90 days), and every rotation
adds the successor, which `replaced_by_id` points at. A renewal retried within 30 seconds of its
rotation, while that successor was never used, replaces it: the unused successor is revoked and
marked `superseded`. Rows are revoked, never updated otherwise, and deleted by the hourly sweep once
past their own expiry; deleting a user deletes them. The rules live in
`apps/api/src/auth/sessions.service.ts`
([adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md](adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md),
[security.md](security.md#authentication-and-tokens)).

## Connections

Each API instance holds a pool of at most `DB_POOL_MAX` connections (default 10), and a request
waits at most 5 seconds for one (`apps/api/src/prisma/prisma.service.ts`; the driver's default is to
wait forever, which would hang requests and health checks instead of failing them). Size them
together (REQUIERE CONFIGURACIÓN):

- every instance at its maximum, plus the migration job and the operators, must fit in the
  database's connection limit: `instances × DB_POOL_MAX + a few < max_connections` (or the limit of
  the API's database role); count the instances autoscaling may add;
- waiting for a connection shows as `db.client.connection.pending_requests` above zero
  ([observability.md](observability.md#database)); raise `DB_POOL_MAX` only when the database has
  room for it;
- many instances against one small database need a connection pooler (PgBouncer, or the
  provider's) between them.

No wait on the database is unbounded: the server cancels a statement that runs longer than
`DB_STATEMENT_TIMEOUT_MS` (30 s by default: a lock wait, a runaway query), the driver gives up on a
query 5 seconds after that (a server that stopped answering cannot cancel anything) and drops the
connection, and TCP keep-alive on idle connections notices a peer that vanished. Raise the
statement timeout for a project whose requests legitimately run long queries, or move that work out
of the request path. Statements slower than `DB_SLOW_QUERY_MS` (500 ms by default) are logged
without their values ([observability.md](observability.md#database)).

**A database that is down does not stop the API.** The boot does not wait for it: an API started
during a database outage, or before the database in a fresh stack, runs, logs
`Database unreachable at boot`, answers readiness with 503, and serves as soon as the database
answers, instead of crash-looping. Liveness stays 200 meanwhile, so the orchestrator holds traffic
back without restarting the process. Requests that reach the database during the outage answer 500,
classified as `database` in the logs and metrics
([error-handling.md](error-handling.md#server-errors)).

TLS to the database when it is not on a private network (`?sslmode=require` in `DATABASE_URL`). Give
the API a role that can read and write the application's tables and nothing else, and the migration
job a role of its own (REQUIERE CONFIGURACIÓN).

## Backups and recovery (REQUIERE CONFIGURACIÓN)

Automated backups, point-in-time recovery for production, tested restores, RPO and RTO are the
database provider's, chosen per project. Deleting an account removes its rows at once, but backups
keep them until they rotate out ([adr/0012-account-deletion.md](adr/0012-account-deletion.md)).
