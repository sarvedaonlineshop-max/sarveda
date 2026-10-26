/** Partha and Arjun can pin a chat owner. Other admins cannot override that assign. */
const CRM_ASSIGN_EMAILS = new Set(["arjun@sarveda.com", "partha@sarveda.com"]);

export function canAssignChatOwner(email?: string | null): boolean {
  return CRM_ASSIGN_EMAILS.has((email ?? "").trim().toLowerCase());
}
