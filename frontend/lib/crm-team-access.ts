/** Keep in step with backend/src/modules/crm/crm-team-access.ts */
const CRM_TEAM_EMAILS = new Set(["arjun@sarveda.com", "partha@sarveda.com"]);

export function canSeeAllCrm(email?: string | null, role?: string | null): boolean {
  if ((role ?? "").toUpperCase() === "SUPER_ADMIN") return true;
  return CRM_TEAM_EMAILS.has((email ?? "").trim().toLowerCase());
}
