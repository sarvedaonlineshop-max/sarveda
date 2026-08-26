import type { AccountingPostingEventStatus } from "@prisma/client";

import { InvalidPostingEventTransitionError } from "./accounting-errors";

const ALLOWED: Record<AccountingPostingEventStatus, AccountingPostingEventStatus[]> = {
  PENDING: ["RETRYING", "POSTED", "FAILED", "SKIPPED"],
  RETRYING: ["POSTED", "FAILED"],
  FAILED: ["RETRYING", "SKIPPED"],
  POSTED: [],
  SKIPPED: []
};

export function assertPostingEventTransition(
  from: AccountingPostingEventStatus,
  to: AccountingPostingEventStatus
): void {
  if (from === to) return;
  if (!ALLOWED[from]?.includes(to)) {
    throw new InvalidPostingEventTransitionError(from, to);
  }
}

export function canPostingEventTransition(
  from: AccountingPostingEventStatus,
  to: AccountingPostingEventStatus
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}
