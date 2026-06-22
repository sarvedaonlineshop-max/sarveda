-- Enquiry chat system (replaces ContactSubmission)

CREATE TYPE "EnquirySource" AS ENUM ('CONTACT', 'CORPORATE', 'COURSE', 'EVENT', 'INSIGHTS');
CREATE TYPE "EnquirySubjectCategory" AS ENUM ('ORDER', 'PAYMENT', 'COURSE', 'CORPORATE', 'OTHER');
CREATE TYPE "EnquiryMessageAuthor" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "EnquiryThreadStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "EnquiryThread" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "EnquirySource" NOT NULL,
    "subjectCategory" "EnquirySubjectCategory",
    "customSubject" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "orderNumber" TEXT,
    "contextTitle" TEXT,
    "contextUrl" TEXT,
    "userId" UUID,
    "status" "EnquiryThreadStatus" NOT NULL DEFAULT 'OPEN',
    "unreadByAdmin" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnquiryThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnquiryMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "authorType" "EnquiryMessageAuthor" NOT NULL,
    "adminUserId" UUID,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnquiryAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnquiryThread_unreadByAdmin_lastMessageAt_idx" ON "EnquiryThread"("unreadByAdmin", "lastMessageAt" DESC);
CREATE INDEX "EnquiryThread_customerEmail_idx" ON "EnquiryThread"("customerEmail");
CREATE INDEX "EnquiryThread_source_idx" ON "EnquiryThread"("source");
CREATE INDEX "EnquiryMessage_threadId_createdAt_idx" ON "EnquiryMessage"("threadId", "createdAt");
CREATE INDEX "EnquiryAttachment_messageId_idx" ON "EnquiryAttachment"("messageId");

ALTER TABLE "EnquiryThread" ADD CONSTRAINT "EnquiryThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryMessage" ADD CONSTRAINT "EnquiryMessage_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnquiryAttachment" ADD CONSTRAINT "EnquiryAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EnquiryMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate legacy ContactSubmission rows
INSERT INTO "EnquiryThread" (
    "id", "source", "subjectCategory", "customSubject", "customerName", "customerEmail",
    "customerPhone", "orderNumber", "userId", "status", "unreadByAdmin", "lastMessageAt",
    "createdAt", "updatedAt"
)
SELECT
    "id",
    CASE
        WHEN "source" = 'order_help' THEN 'CONTACT'::"EnquirySource"
        ELSE 'CONTACT'::"EnquirySource"
    END,
    CASE WHEN "orderNumber" IS NOT NULL AND "orderNumber" <> '' THEN 'ORDER'::"EnquirySubjectCategory" ELSE 'OTHER'::"EnquirySubjectCategory" END,
    "subject",
    "name",
    "email",
    "phone",
    "orderNumber",
    "userId",
    'OPEN'::"EnquiryThreadStatus",
    false,
    "createdAt",
    "createdAt",
    "createdAt"
FROM "ContactSubmission"
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ContactSubmission');

INSERT INTO "EnquiryMessage" (
    "threadId", "authorType", "authorName", "authorEmail", "body", "createdAt"
)
SELECT
    "id",
    'CUSTOMER'::"EnquiryMessageAuthor",
    "name",
    "email",
    "message",
    "createdAt"
FROM "ContactSubmission"
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ContactSubmission');

DROP TABLE IF EXISTS "ContactSubmission";
