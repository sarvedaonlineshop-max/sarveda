-- Backfill isPrivate for self-created tasks (single assignee = creator).
UPDATE "Complaint" c
SET "isPrivate" = true
WHERE c."isPrivate" = false
  AND EXISTS (
    SELECT 1
    FROM "TaskAssignee" ta
    WHERE ta."taskId" = c.id
    GROUP BY ta."taskId"
    HAVING COUNT(*) = 1
      AND MAX(LOWER(ta."assigneeEmail")) = LOWER(c."raisedByEmail")
  );
