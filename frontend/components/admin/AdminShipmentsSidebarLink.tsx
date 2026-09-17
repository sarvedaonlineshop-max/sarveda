"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Truck } from "lucide-react";

import { fetchAdminShipments } from "@/lib/admin-api";
import { AdminChatsSidebarLink } from "@/components/admin/AdminChatsSidebarLink";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

export function AdminShipmentsSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/shipments" || activePath.startsWith("/admin/shipments/");
  const [readyCount, setReadyCount] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      try {
        const data = await fetchAdminShipments({ bucket: "ready", page: 1, limit: 1 });
        setReadyCount(data.counts?.ready ?? data.pagination.total ?? 0);
      } catch {
        // Keep the last known count during transient failures.
      }
    };
    void loadCount();
    const timer = setInterval(() => void loadCount(), 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <>
      <Link
        href="/admin/shipments"
        onClick={() => {
          nav?.beginNavigation("/admin/shipments");
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
          <Truck size={18} strokeWidth={2} />
        </span>
        <span style={{ flex: 1 }}>Shipments</span>
        {readyCount > 0 ? (
          <span
            title="Ready to ship"
            aria-label={`${readyCount} ready to ship`}
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
            {readyCount > 99 ? "99+" : readyCount}
          </span>
        ) : null}
      </Link>
      <AdminChatsSidebarLink onNavigate={onNavigate} placedNextToShipments />
    </>
  );
}
