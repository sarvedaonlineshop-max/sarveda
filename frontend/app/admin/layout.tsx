import type { Metadata } from "next";

import { AdminAuthBoundary } from "@/components/admin/AdminAuthBoundary";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false }
};

export default function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminAuthBoundary>
      <AdminShell>{children}</AdminShell>
    </AdminAuthBoundary>
  );
}
