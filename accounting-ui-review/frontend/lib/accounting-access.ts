/** Staff allowed to see / use Accounting (Books) admin UI + APIs during UAT. */
export const ACCOUNTING_ALLOWED_EMAILS = [
  "arjun@sarveda.com",
  "partha@sarveda.com",
  "accounts@sarveda.com",
  "deepak@sarveda.com"
] as const;

function parseAllowListFromEnv(): string[] | null {
  const raw = (process.env.ACCOUNTING_ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ACCOUNTING_ADMIN_EMAILS ?? "")
    .trim();
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
