-- CreateEnum
CREATE TYPE "ComplaintAppRole" AS ENUM ('ADMIN', 'STAFF');

-- AlterTable
ALTER TABLE "ComplaintWhitelist" ADD COLUMN "role" "ComplaintAppRole" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "ComplaintWhitelist" ADD COLUMN "passwordHash" TEXT;
