import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AdminAuthBoundary } from "@/components/admin/AdminAuthBoundary";
import { AdminShell } from "@/components/admin/AdminShell";

const adminSans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  display: "swap"
});

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
    <div className={`${adminSans.variable} ${adminSans.className}`}>
      <AdminAuthBoundary>
        <AdminShell>{children}</AdminShell>
      </AdminAuthBoundary>
    </div>
  );
}
