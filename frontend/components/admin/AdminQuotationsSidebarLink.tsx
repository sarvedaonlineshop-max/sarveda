"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";

import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";
import { crmApi } from "@/lib/crm-api";

const href = "/admin/quotations?status=PENDING";

export function AdminQuotationsSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/quotations" || activePath.startsWith("/admin/quotations/");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      try {
        setPendingCount((await crmApi.quoteApprovalCount()).pending);
      } catch {
        // Keep the last known count if the desk is briefly unreachable.
      }
    };
    void loadCount();
    const timer = setInterval(() => void loadCount(), 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <Link
      href={href}
      onClick={() => {
        nav?.beginNavigation(href);
        onNavigate?.();
      }}
      style={sidebarLinkStyle(active)}
      onMouseEnter={(e) => applySidebarHover(e.currentTarget, active)}
      onMouseLeave={(e) => clearSidebarHover(e.currentTarget, active)}
    >
      <span
        data-nav-icon
        style={{
          color: active ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
          flexShrink: 0,
          transition: "color 0.15s ease"
        }}
      >
        <ScrollText size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>Quotations</span>
      {pendingCount > 0 ? (
        <span
          title="Waiting for approval"
          aria-label={`${pendingCount} quotations waiting for approval`}
          style={{
            minWidth: "20px",
            height: "20px",
            padding: "0 6px",
            borderRadius: "999px",
            background: "#dc2626",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      ) : null}
    </Link>
  );
}
