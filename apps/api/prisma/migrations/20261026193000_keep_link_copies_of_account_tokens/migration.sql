-- Every flow that uses a one-time token writes account_tokens: never wait
-- long for its lock (docs/database.md#safe-migrations).
SET lock_timeout = '5s';

-- The outbox message whose copy carries the token (auth/account-tokens.ts):
-- a re-render of that message (a retry, a takeover: email is at least once)
-- keeps the earlier copies' tokens working instead of replacing them. A
-- nullable column: the previous release leaves it empty and replaces every
-- earlier token, as it did.
-- AlterTable
ALTER TABLE "account_tokens" ADD COLUMN "mail_message_id" UUID;
