-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminQuoteNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
