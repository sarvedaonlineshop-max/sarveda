"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";
import { fetchPendingServiceRequestCount } from "@/lib/order-service-request";

const returnsHref = "/admin/returns?stage=PENDING_APPROVAL";

export function AdminReturnsSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/returns" || activePath.startsWith("/admin/returns/");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      try {
        setPendingCount(await fetchPendingServiceRequestCount());
      } catch {
        // Keep the last known value during a transient refresh failure.
      }
    };

    void loadCount();
    const timer = setInterval(() => void loadCount(), 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <Link
      href={returnsHref}
      onClick={() => {
        nav?.beginNavigation(returnsHref);
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
        <RotateCcw size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>Returns</span>
      {pendingCount > 0 ? (
        <span
          title="Pending approval"
          aria-label={`${pendingCount} pending return approvals`}
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
            justifyContent: "center",
            boxShadow: "0 6px 12px rgba(220,38,38,0.26)"
          }}
        >
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      ) : null}
    </Link>
  );
}
