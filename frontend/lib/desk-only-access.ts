/** Keep in sync with backend/src/modules/auth/desk-only-access.ts */
const DESK_ONLY_ADMIN_EMAILS = ["karthik@sarveda.com"] as const;

export function isDeskOnlyAdmin(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return DESK_ONLY_ADMIN_EMAILS.some((allowed) => allowed === normalized);
}

export function deskOnlyAdminHome(): string {
  return "/admin/chats";
}

export function isDeskOnlyAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin/chats" ||
    pathname.startsWith("/admin/chats/") ||
    pathname === "/admin/quotations" ||
    pathname.startsWith("/admin/quotations/") ||
    pathname === "/admin/tasks" ||
    pathname.startsWith("/admin/tasks/") ||
    pathname === "/admin/profile" ||
    pathname.startsWith("/admin/profile/") ||
    pathname.startsWith("/admin/orders/") ||
    pathname.startsWith("/admin/shipments/") ||
    (pathname.startsWith("/admin/returns/") && pathname !== "/admin/returns/analytics")
  );
}
