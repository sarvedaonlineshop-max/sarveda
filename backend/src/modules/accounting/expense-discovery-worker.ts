import {
  isAccountingExpensePostingEnabled,
  isNativeAccountingEnabled
} from "./accounting-flag";
import {
  assertBulkDiscoveryAllowed,
  resolveExpenseDiscoveryDryRun
} from "./production-guard";
import {
  postExpenseRecordedJournal,
  previewExpenseRecordedJournal
} from "./expense-posting.service";
import {
  findExpenseDiscoveryCandidates,
  loadExpenseSnapshotById
} from "./expense-snapshot.service";

export type ExpenseDiscoveryInput = {
  expenseId?: string;
  vendorId?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  dryRun?: boolean;
  acknowledgePossibleDuplicate?: boolean;
  postedByUserId?: string;
};

export type ExpenseDiscoveryRow = {
  expenseId: string;
  status: string;
  eligible: boolean;
  eligibilityCode: string;
  action: string;
  journalEntryNumber?: string;
  error?: string;
  warnings: string[];
};

export async function runExpenseDiscovery(input: ExpenseDiscoveryInput) {
  if (!isNativeAccountingEnabled()) {
    return {
      dryRun: true,
      scanned: 0,
      posted: 0,
      skipped: 0,
      rows: [] as ExpenseDiscoveryRow[],
      disabled: true
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 500);
  const dryRun = resolveExpenseDiscoveryDryRun(input.dryRun);
  assertBulkDiscoveryAllowed({
    expenseId: input.expenseId,
    limit,
    dryRun,
    persist: !dryRun && isAccountingExpensePostingEnabled()
  });

  const candidates = await findExpenseDiscoveryCandidates({
    expenseId: input.expenseId,
    vendorId: input.vendorId,
    since: input.since,
    until: input.until,
    limit
  });

  const rows: ExpenseDiscoveryRow[] = [];
  let posted = 0;
  let skipped = 0;

  for (const c of candidates) {
    try {
      const snapshot = await loadExpenseSnapshotById(c.id);
      const preview = await previewExpenseRecordedJournal(snapshot, {
        acknowledgePossibleDuplicate: input.acknowledgePossibleDuplicate
      });

      if (preview.sourceChangedAfterPost) {
        skipped += 1;
        rows.push({
          expenseId: c.id,
          status: snapshot.status,
          eligible: false,
          eligibilityCode: "SOURCE_CHANGED_AFTER_POST",
          action: "SKIP",
          warnings: ["REVERSAL_REQUIRED"]
        });
        continue;
      }

      if (preview.postingEvent?.status === "POSTED") {
        skipped += 1;
        rows.push({
          expenseId: c.id,
          status: snapshot.status,
          eligible: true,
          eligibilityCode: "ALREADY_POSTED",
          action: "SKIP",
          journalEntryNumber: undefined,
          warnings: preview.eligibility.warnings
        });
        continue;
      }

      if (!preview.eligibility.eligible) {
        skipped += 1;
        rows.push({
          expenseId: c.id,
          status: snapshot.status,
          eligible: false,
          eligibilityCode: preview.eligibility.code,
          action: "SKIP",
          warnings: preview.eligibility.warnings,
          error: preview.eligibility.reason
        });
        continue;
      }

      if (dryRun || !isAccountingExpensePostingEnabled()) {
        rows.push({
          expenseId: c.id,
          status: snapshot.status,
          eligible: true,
          eligibilityCode: preview.eligibility.code,
          action: "WOULD_POST",
          warnings: preview.eligibility.warnings
        });
        continue;
      }

      const post = await postExpenseRecordedJournal(snapshot, {
        postedByUserId: input.postedByUserId,
        acknowledgePossibleDuplicate: input.acknowledgePossibleDuplicate
      });
      posted += 1;
      rows.push({
        expenseId: c.id,
        status: snapshot.status,
        eligible: true,
        eligibilityCode: "ELIGIBLE",
        action: post.duplicate ? "ALREADY_POSTED" : "POSTED",
        journalEntryNumber: post.journal.entryNumber,
        warnings: preview.eligibility.warnings
      });
    } catch (err) {
      skipped += 1;
      rows.push({
        expenseId: c.id,
        status: "ERROR",
        eligible: false,
        eligibilityCode: "ERROR",
        action: "ERROR",
        warnings: [],
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    dryRun,
    scanned: candidates.length,
    posted,
    skipped,
    rows,
    disabled: false
  };
}
