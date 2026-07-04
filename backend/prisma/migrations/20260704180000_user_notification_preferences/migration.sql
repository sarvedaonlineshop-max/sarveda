-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
