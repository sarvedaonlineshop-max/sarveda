/**
 * Accounting cutover date — separates legacy/pre-migration documents from
 * native shadow posting authority. Commerce/purchases ops are unaffected.
 *
 * ACCOUNTING_CUTOVER_DATE — ISO date (YYYY-MM-DD) or full ISO datetime.
 * Documents dated strictly before this instant are PRE_CUTOVER.
 *
 * ACCOUNTING_CUTOVER_FORWARD_ONLY=1 — block posting pre-cutover documents
 * unless allowPreCutover is explicitly passed on the post call.
 */
import { PreCutoverPostingBlockedError } from "./accounting-errors";

export type CutoverClassification = "PRE_CUTOVER" | "POST_CUTOVER" | "NO_CUTOVER_CONFIGURED";

let cachedCutover: Date | null | undefined;

export function getAccountingCutoverDate(): Date | null {
  if (cachedCutover !== undefined) return cachedCutover;

  const raw = (process.env.ACCOUNTING_CUTOVER_DATE ?? "").trim();
  if (!raw) {
    cachedCutover = null;
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    cachedCutover = null;
    return null;
  }
  cachedCutover = parsed;
  return parsed;
}

/** Reset cached cutover (tests only). */
export function resetAccountingCutoverCache(): void {
  cachedCutover = undefined;
}

export function isAccountingCutoverForwardOnly(): boolean {
  const v = (process.env.ACCOUNTING_CUTOVER_FORWARD_ONLY ?? "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(v);
}

export function classifyCutover(documentDate: Date): CutoverClassification {
  const cutover = getAccountingCutoverDate();
  if (!cutover) return "NO_CUTOVER_CONFIGURED";
  return documentDate.getTime() < cutover.getTime() ? "PRE_CUTOVER" : "POST_CUTOVER";
}

export function isPreCutoverDocument(documentDate: Date): boolean {
  return classifyCutover(documentDate) === "PRE_CUTOVER";
}

/**
 * Block forward-only posting for documents dated before cutover.
 * Preview/reconciliation may still classify PRE_CUTOVER without throwing.
 */
export function assertDocumentDateAllowedForPosting(
  documentDate: Date,
  opts?: { allowPreCutover?: boolean }
): void {
  if (opts?.allowPreCutover) return;
  if (!isAccountingCutoverForwardOnly()) return;

  const cutover = getAccountingCutoverDate();
  if (!cutover) return;

  if (documentDate.getTime() < cutover.getTime()) {
    throw new PreCutoverPostingBlockedError(cutover.toISOString());
  }
}

export function getCutoverConfigSummary(): {
  cutoverDate: string | null;
  forwardOnly: boolean;
} {
  const cutover = getAccountingCutoverDate();
  return {
    cutoverDate: cutover ? cutover.toISOString() : null,
    forwardOnly: isAccountingCutoverForwardOnly()
  };
}
