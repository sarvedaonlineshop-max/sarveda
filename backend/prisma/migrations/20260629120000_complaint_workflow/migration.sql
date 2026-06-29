-- Assignee accept/deny workflow + deadline extension requests + avatar S3 keys

CREATE TYPE "AssigneeResponseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DENIED_AWAITING_OWNER');

ALTER TABLE "TaskAssignee" ADD COLUMN "responseStatus" "AssigneeResponseStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "Complaint" ADD COLUMN "pendingDeadlineDate" TIMESTAMP(3);
ALTER TABLE "Complaint" ADD COLUMN "pendingDeadlineRequestedBy" TEXT;

ALTER TABLE "User" ADD COLUMN "avatarS3Key" TEXT;
ALTER TABLE "ComplaintWhitelist" ADD COLUMN "avatarS3Key" TEXT;
