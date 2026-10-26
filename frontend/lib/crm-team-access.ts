/** Keep in step with backend/src/modules/crm/crm-team-access.ts */
const CRM_ASSIGN_EMAILS = new Set(["arjun@sarveda.com", "partha@sarveda.com"]);

export function canAssignChatOwner(email?: string | null): boolean {
  return CRM_ASSIGN_EMAILS.has((email ?? "").trim().toLowerCase());
}
