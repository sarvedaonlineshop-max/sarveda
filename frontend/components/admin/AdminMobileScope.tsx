"use client";

import { usePathname } from "next/navigation";

export function AdminMobileScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const responsiveEnabled = !pathname.startsWith("/admin/accounting");

  return (
    <div
      data-admin-mobile={responsiveEnabled ? "true" : "false"}
      className={responsiveEnabled ? "admin-mobile-scope" : undefined}
    >
      {children}
    </div>
  );
}
