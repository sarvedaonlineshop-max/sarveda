/**
 * Staff sign-in rules.
 * care@sarveda.com is the public support mailbox. It must not sign in,
 * including with OTP or a password.
 * Store admin is kept only for super-admins, bootstrap admins, and an active whitelist row.
 */

export const STAFF_LOGIN_BLOCKED_EMAILS = ["care@sarveda.com"] as const;

export type StaffRole = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

export function isStaffLoginBlocked(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return (STAFF_LOGIN_BLOCKED_EMAILS as readonly string[]).includes(normalized);
}

export function staffRoleAfterLogin(input: {
  email: string;
  role: StaffRole;
  superAdmins: ReadonlySet<string>;
  bootstrapAdmins: ReadonlySet<string>;
  activeWhitelist: boolean;
}): StaffRole {
  const email = input.email.trim().toLowerCase();
  if (isStaffLoginBlocked(email)) return "CUSTOMER";
  if (input.superAdmins.has(email)) return "SUPER_ADMIN";
  if (input.role === "CUSTOMER" && input.bootstrapAdmins.has(email)) return "ADMIN";
  const permitted =
    input.superAdmins.has(email) || input.bootstrapAdmins.has(email) || input.activeWhitelist;
  if ((input.role === "ADMIN" || input.role === "SUPER_ADMIN") && !permitted) return "CUSTOMER";
  return input.role;
}
