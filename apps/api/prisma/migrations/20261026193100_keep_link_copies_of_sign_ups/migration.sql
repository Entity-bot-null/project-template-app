-- Sign-ups and their confirmations write sign_ups: never wait long for its
-- lock (docs/database.md#safe-migrations). The table holds only sign-ups
-- waiting for their link: the index builds at once.
SET lock_timeout = '5s';

-- The tokens of the confirmation message's earlier copies (a retry, a
-- takeover: email is at least once), each one working as token_hash does
-- (auth/sign-up.service.ts). The previous release neither reads nor writes
-- it: a re-render there replaces the token, as it did.
-- AlterTable
ALTER TABLE "sign_ups" ADD COLUMN "earlier_token_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A link's lookup by an earlier copy's token.
-- CreateIndex
CREATE INDEX "sign_ups_earlier_token_hashes_idx" ON "sign_ups" USING GIN ("earlier_token_hashes");
