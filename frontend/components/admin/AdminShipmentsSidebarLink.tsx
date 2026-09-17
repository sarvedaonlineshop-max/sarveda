"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck } from "lucide-react";

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

  return (
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
    </Link>
  );
}
