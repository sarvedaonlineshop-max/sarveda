-- Per-assignee "done for me" close; global close remains owner-only
ALTER TABLE "TaskAssignee" ADD COLUMN "markedClosedAt" TIMESTAMP(3);
