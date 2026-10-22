-- The notice sent when an account is deleted. Adding an enum value takes no
-- table lock; the release before this one never writes it.

-- AlterEnum
ALTER TYPE "MailKind" ADD VALUE 'account_deleted';
