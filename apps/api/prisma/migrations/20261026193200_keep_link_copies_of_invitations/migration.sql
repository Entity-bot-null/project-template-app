-- Invitations and their acceptances write invitations: never wait long for
-- its lock (docs/database.md#safe-migrations). The table holds only pending
-- invitations: the index builds at once.
SET lock_timeout = '5s';

-- The tokens of the invitation message's earlier copies (a retry, a
-- takeover: email is at least once), each one working as token_hash does
-- (invitations/invitations.service.ts). The previous release neither reads
-- nor writes it: a re-render there replaces the token, as it did.
-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "earlier_token_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A link's lookup by an earlier copy's token.
-- CreateIndex
CREATE INDEX "invitations_earlier_token_hashes_idx" ON "invitations" USING GIN ("earlier_token_hashes");
