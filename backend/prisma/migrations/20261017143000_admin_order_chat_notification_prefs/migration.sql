-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminOrderNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "adminChatNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
