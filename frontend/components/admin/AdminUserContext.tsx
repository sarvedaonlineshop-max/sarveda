"use client";

import { createContext, useContext } from "react";
import type { PublicUser } from "@/lib/auth-client";

const AdminUserContext = createContext<PublicUser | null>(null);

export function AdminUserProvider({
  user,
  children
}: {
  user: PublicUser | null;
  children: React.ReactNode;
}) {
  return <AdminUserContext.Provider value={user}>{children}</AdminUserContext.Provider>;
}

export function useAdminUser(): PublicUser | null {
  return useContext(AdminUserContext);
}

export function useIsSuperAdmin(): boolean {
  const user = useAdminUser();
  return (user?.role ?? "").toUpperCase() === "SUPER_ADMIN";
}
