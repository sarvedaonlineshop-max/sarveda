import type { Prisma } from "@prisma/client";

export function normComplaintEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Self-created personal task — visible to owner only (Home / assigned-to-me), not team All Tasks. */
export function computeIsPrivate(raisedByEmail: string, assigneeEmails: string[]): boolean {
  const owner = normComplaintEmail(raisedByEmail);
  const assignees = assigneeEmails.map(normComplaintEmail).filter(Boolean);
  if (assignees.length === 0) return true;
  return assignees.length === 1 && assignees[0] === owner;
}

type TaskAssigneeLike = { assigneeEmail: string };

export function isSelfOnlyTask(task: {
  raisedByEmail: string;
  assignees: TaskAssigneeLike[];
}): boolean {
  const assignees = task.assignees ?? [];
  if (assignees.length === 0) return true;
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

/** Prisma filter for personal views (Home, assigned-to-me) — owner still sees own private tasks. */
export function privateTaskWhere(viewerEmail: string): Prisma.ComplaintWhereInput {
  const viewer = normComplaintEmail(viewerEmail);
  return {
    OR: [
      { isPrivate: false },
      { isPrivate: true, raisedByEmail: { equals: viewer, mode: "insensitive" } }
    ]
  };
}

/** Team board (All Tasks) — never includes personal/private tasks, even for the owner. */
export function teamBoardTaskWhere(): Prisma.ComplaintWhereInput {
  return { isPrivate: false };
}

export function filterTeamBoardTasks<
  T extends {
    raisedByEmail: string;
    isPrivate: boolean;
    assignees: TaskAssigneeLike[];
  }
>(tasks: T[]): T[] {
  return tasks.filter((t) => !isPrivateToOwner(t));
}
