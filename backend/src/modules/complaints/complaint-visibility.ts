import type { Prisma } from "@prisma/client";

export function normComplaintEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Self-created task with only the creator as assignee — visible to owner only. */
export function computeIsPrivate(raisedByEmail: string, assigneeEmails: string[]): boolean {
  const owner = normComplaintEmail(raisedByEmail);
  const assignees = assigneeEmails.map(normComplaintEmail).filter(Boolean);
  return assignees.length === 1 && assignees[0] === owner;
}

type TaskAssigneeLike = { assigneeEmail: string };

export function isSelfOnlyTask(task: {
  raisedByEmail: string;
  assignees: TaskAssigneeLike[];
}): boolean {
  const assignees = task.assignees ?? [];
  if (assignees.length !== 1) return false;
  return normComplaintEmail(assignees[0]!.assigneeEmail) === normComplaintEmail(task.raisedByEmail);
}

export function isPrivateToOwner(task: {
  raisedByEmail: string;
  isPrivate: boolean;
  assignees: TaskAssigneeLike[];
}): boolean {
  return task.isPrivate || isSelfOnlyTask(task);
}

export function canViewerSeeTaskInMemberList(
  task: {
    raisedByEmail: string;
    isPrivate: boolean;
    assignees: TaskAssigneeLike[];
  },
  viewerEmail: string
): boolean {
  const viewer = normComplaintEmail(viewerEmail);
  const owner = normComplaintEmail(task.raisedByEmail);
  if (viewer === owner) return true;
  if (isPrivateToOwner(task)) return false;
  return true;
}

export function filterTasksVisibleToViewer<
  T extends {
    raisedByEmail: string;
    isPrivate: boolean;
    assignees: TaskAssigneeLike[];
  }
>(tasks: T[], viewerEmail: string): T[] {
  return tasks.filter((t) => canViewerSeeTaskInMemberList(t, viewerEmail));
}

/** Prisma filter for member list endpoints (All Tasks, etc.). */
export function privateTaskWhere(viewerEmail: string): Prisma.ComplaintWhereInput {
  const viewer = normComplaintEmail(viewerEmail);
  return {
    OR: [
      { isPrivate: false },
      { isPrivate: true, raisedByEmail: { equals: viewer, mode: "insensitive" } }
    ]
  };
}
