-- Self-assigned tasks visible only to the creator in All Tasks
ALTER TABLE "Complaint" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Complaint_isPrivate_idx" ON "Complaint"("isPrivate");
