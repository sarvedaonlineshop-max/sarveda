/** Store admins who may use only Chats, Quotations, Tasks, and Profile. */
export const DESK_ONLY_ADMIN_EMAILS = ["karthik@sarveda.com"] as const;

export function isDeskOnlyAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return (DESK_ONLY_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

const READ_LISTS = new Set(["/api/admin/orders", "/api/admin/shipments", "/api/admin/return-cases"]);
const ORDER_ID = /^\/api\/admin\/orders\/[0-9a-f-]{36}$/i;
const ORDER_SHIPPING = /^\/api\/admin\/orders\/[0-9a-f-]{36}\/shipping-breakdown$/i;

/**
 * Chats and quotations, plus the read calls the chat Order tab makes.
 * Tasks and profile use /api/complaints, which is allowed only for the admin handoff.
 */
export function deskOnlyRequestAllowed(method: string, rawPath: string): boolean {
  const path = rawPath.split("?")[0] ?? "";
  if (path.startsWith("/api/admin/enquiries")) return true;
  if (path.startsWith("/api/admin/crm/chat-pipeline")) return true;
  if (path.startsWith("/api/admin/crm/assignees")) return true;
  if (path.startsWith("/api/admin/crm/sales-quotes")) return true;
  if (path.startsWith("/api/admin/crm/quote-catalog")) return true;
  if (method === "GET" && READ_LISTS.has(path)) return true;
  if (method === "GET" && (ORDER_ID.test(path) || ORDER_SHIPPING.test(path))) return true;
  if (method === "GET" && path === "/api/admin/pickup-locations") return true;
  if (method === "GET" && path.startsWith("/api/admin/return-cases/by-number/")) return true;
  if (method === "POST" && path === "/api/complaints/auth/from-admin") return true;
  if (
    (method === "GET" || method === "PATCH") &&
    path === "/api/admin/notification-preferences"
  ) {
    return true;
  }
  return false;
}
