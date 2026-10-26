/** Admins who may open the whole team's CRM. Everyone else is scoped to their own rows. */
const CRM_TEAM_EMAILS = new Set(["arjun@sarveda.com", "partha@sarveda.com"]);

export function canSeeAllCrm(email?: string | null, role?: string | null): boolean {
  if ((role ?? "").toUpperCase() === "SUPER_ADMIN") return true;
  return CRM_TEAM_EMAILS.has((email ?? "").trim().toLowerCase());
}

/** Partha and Arjun can pin a chat owner. Other admins cannot override that assign. */
export function canAssignChatOwner(email?: string | null): boolean {
  return CRM_TEAM_EMAILS.has((email ?? "").trim().toLowerCase());
}
