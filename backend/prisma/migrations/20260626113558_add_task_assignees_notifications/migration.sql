-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "assignedByEmail" TEXT,
ADD COLUMN     "assignedByName" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "assigneeEmail" TEXT NOT NULL,
    "assigneeName" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskNotification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipientEmail" TEXT NOT NULL,
    "taskId" UUID NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAssignee_assigneeEmail_idx" ON "TaskAssignee"("assigneeEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_assigneeEmail_key" ON "TaskAssignee"("taskId", "assigneeEmail");

-- CreateIndex
CREATE INDEX "TaskNotification_recipientEmail_isRead_idx" ON "TaskNotification"("recipientEmail", "isRead");

-- CreateIndex
CREATE INDEX "TaskNotification_taskId_idx" ON "TaskNotification"("taskId");

-- CreateIndex
CREATE INDEX "Complaint_assignedByEmail_idx" ON "Complaint"("assignedByEmail");

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
