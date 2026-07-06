-- Personal tasks with no assignees should not appear on the team board.
UPDATE "Complaint" c
SET "isPrivate" = true
WHERE c."isPrivate" = false
  AND c."parentId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TaskAssignee" ta WHERE ta."taskId" = c.id
  );
