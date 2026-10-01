export const SERVERS_DASHBOARD_EMAIL = "partha@sarveda.com";

export function isServersDashboardEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SERVERS_DASHBOARD_EMAIL;
}
