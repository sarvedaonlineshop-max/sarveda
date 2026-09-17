import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AdminAuthBoundary } from "@/components/admin/AdminAuthBoundary";
import { AdminMobileScope } from "@/components/admin/AdminMobileScope";
import { AdminShell } from "@/components/admin/AdminShell";
import "./admin-mobile.css";

const adminSans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
  manifest: "/admin-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sarveda Admin"
  }
};

export default function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${adminSans.variable} ${adminSans.className}`}>
      <AdminAuthBoundary>
        <AdminMobileScope>
          <AdminShell>{children}</AdminShell>
        </AdminMobileScope>
      </AdminAuthBoundary>
    </div>
  );
}
