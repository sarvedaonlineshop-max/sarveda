-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "ComplaintWhitelist" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "ComplaintEvent" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
