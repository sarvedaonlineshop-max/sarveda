-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN "parentId" UUID;

-- CreateIndex
CREATE INDEX "Complaint_parentId_idx" ON "Complaint"("parentId");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
