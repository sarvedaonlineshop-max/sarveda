"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contact } from "lucide-react";

import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

export function AdminCrmSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/crm" || activePath.startsWith("/admin/crm/");

  return (
    <Link
      href="/admin/crm"
      onClick={() => {
        nav?.beginNavigation("/admin/crm");
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
        <Contact size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>CRM</span>
    </Link>
  );
}
