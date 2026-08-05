CREATE TABLE "WhatsAppAgentSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL,
  "reason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attendingAdminId" UUID,
  "claimedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "customerRating" INTEGER,
  "ratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppAgentSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppAgentSession_customerRating_check"
    CHECK ("customerRating" IS NULL OR "customerRating" BETWEEN 1 AND 5)
);

ALTER TABLE "WhatsAppAgentSession"
  ADD CONSTRAINT "WhatsAppAgentSession_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAgentSession"
  ADD CONSTRAINT "WhatsAppAgentSession_attendingAdminId_fkey"
  FOREIGN KEY ("attendingAdminId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WhatsAppAgentSession_threadId_startedAt_idx"
  ON "WhatsAppAgentSession"("threadId", "startedAt" DESC);

CREATE INDEX "WhatsAppAgentSession_attendingAdminId_startedAt_idx"
  ON "WhatsAppAgentSession"("attendingAdminId", "startedAt" DESC);

CREATE INDEX "WhatsAppAgentSession_endedAt_idx"
  ON "WhatsAppAgentSession"("endedAt");

-- Prevent duplicate active handoffs for one conversation while allowing a
-- thread to accumulate historical sessions.
CREATE UNIQUE INDEX "WhatsAppAgentSession_one_open_per_thread"
  ON "WhatsAppAgentSession"("threadId")
  WHERE "endedAt" IS NULL;
