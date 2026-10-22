-- sessions is written by every sign-in, renewal and logout: never wait long
-- for its lock (docs/database.md#safe-migrations). Expand only: the release
-- before this one ignores both columns.
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "replaced_by_id" UUID,
ADD COLUMN     "superseded" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_replaced_by_id_key" ON "sessions"("replaced_by_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
