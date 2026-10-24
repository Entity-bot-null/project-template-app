-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "PushTokenKind" AS ENUM ('expo');

-- CreateEnum
CREATE TYPE "PushKind" AS ENUM ('password_changed');

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('pending', 'sending', 'sent', 'delivered', 'failed', 'expired');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "push_token" TEXT NOT NULL,
    "kind" "PushTokenKind" NOT NULL DEFAULT 'expo',
    "platform" "DevicePlatform" NOT NULL,
    "app_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_messages" (
    "id" UUID NOT NULL,
    "kind" "PushKind" NOT NULL,
    "status" "PushStatus" NOT NULL DEFAULT 'pending',
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "ticket_id" TEXT,
    "receipt_check_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_installation_id_key" ON "devices"("installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "devices_last_seen_at_idx" ON "devices"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_messages_ticket_id_key" ON "push_messages"("ticket_id");

-- CreateIndex
CREATE INDEX "push_messages_status_next_attempt_at_idx" ON "push_messages"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "push_messages_status_receipt_check_at_idx" ON "push_messages"("status", "receipt_check_at");

-- CreateIndex
CREATE INDEX "push_messages_created_at_idx" ON "push_messages"("created_at");

-- CreateIndex
CREATE INDEX "push_messages_user_id_idx" ON "push_messages"("user_id");

-- CreateIndex
CREATE INDEX "push_messages_device_id_idx" ON "push_messages"("device_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The outbox's and the devices' invariants, enforced for every writer
-- (schema.prisma, Device and PushMessage).
ALTER TABLE "devices" ADD CONSTRAINT "devices_push_token_check" CHECK (
    "kind" <> 'expo' OR "push_token" ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'
);
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_attempts_check" CHECK ("attempts" >= 0);
-- A claimed notification always has a lease, so a crashed worker's claim ends.
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_sending_lease_check" CHECK ("status" <> 'sending' OR "locked_until" IS NOT NULL);
-- Not handed to the push service yet: no ticket, no send time.
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_unsent_check" CHECK (
    "status" NOT IN ('pending', 'sending') OR ("ticket_id" IS NULL AND "sent_at" IS NULL)
);
-- Handed over: its ticket and when it was sent; a sent one also when its
-- receipt is read.
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_sent_check" CHECK (
    "status" NOT IN ('sent', 'delivered') OR ("ticket_id" IS NOT NULL AND "sent_at" IS NOT NULL)
);
ALTER TABLE "push_messages" ADD CONSTRAINT "push_messages_receipt_check" CHECK ("status" <> 'sent' OR "receipt_check_at" IS NOT NULL);
