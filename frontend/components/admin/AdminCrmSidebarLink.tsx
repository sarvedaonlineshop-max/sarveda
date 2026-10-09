"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contact } from "lucide-react";

import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";
import { isCrmSidebarEmail } from "@/lib/crm-access";

export function AdminCrmSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const adminUser = useAdminUser();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/crm" || activePath.startsWith("/admin/crm/");

  if (!isCrmSidebarEmail(adminUser?.email)) return null;

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
