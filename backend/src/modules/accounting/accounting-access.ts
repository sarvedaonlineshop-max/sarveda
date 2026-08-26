/**
 * Staff allowed to use Accounting admin APIs during UAT.
 * Optional override: ACCOUNTING_ADMIN_EMAILS=comma,separated,emails
 */
export const ACCOUNTING_ALLOWED_EMAILS = [
  "arjun@sarveda.com",
  "partha@sarveda.com",
  "accounts@sarveda.com",
  "deepak@sarveda.com"
] as const;

function parseAllowListFromEnv(): string[] | null {
  const raw = (process.env.ACCOUNTING_ADMIN_EMAILS ?? "").trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
}

export function accountingAllowList(): string[] {
  return parseAllowListFromEnv() ?? [...ACCOUNTING_ALLOWED_EMAILS];
}

export function isAccountingEmailAllowed(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return accountingAllowList().includes(normalized);
}
