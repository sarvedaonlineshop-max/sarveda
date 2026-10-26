/** Keep in sync with backend/src/middleware/admin.ts REPORTS_ONLY_ADMIN_EMAILS. */
const REPORTS_ONLY_ADMIN_EMAILS = [
  "astha@sarveda.com",
  "rahul@sarveda.com"
] as const;

export function isReportsOnlyAdmin(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return REPORTS_ONLY_ADMIN_EMAILS.some((allowed) => allowed === normalized);
}

export function reportsOnlyAdminHome(): string {
  return "/admin/reports";
}
