/** Left-nav CRM is limited to this staff email. */
export const CRM_SIDEBAR_EMAIL = "partha@sarveda.com";

export function isCrmSidebarEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === CRM_SIDEBAR_EMAIL;
}
