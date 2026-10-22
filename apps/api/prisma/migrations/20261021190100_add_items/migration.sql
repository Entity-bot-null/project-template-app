-- The foreign key below takes a short lock on users, which every request
-- reads and writes: never wait long for it (docs/database.md#safe-migrations).
SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" VARCHAR(255),
    "request_hash" CHAR(64),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_owner_id_created_at_id_idx" ON "items"("owner_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "items_owner_id_idempotency_key_key" ON "items"("owner_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
