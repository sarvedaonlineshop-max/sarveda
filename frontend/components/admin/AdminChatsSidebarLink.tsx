"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquareMore } from "lucide-react";

import { fetchEnquiryUnreadCount } from "@/lib/admin-api";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

export function AdminChatsSidebarLink({
  onNavigate
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/chats" || activePath.startsWith("/admin/chats/");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void fetchEnquiryUnreadCount()
      .then(setUnread)
      .catch(() => setUnread(0));
    const timer = setInterval(() => {
      void fetchEnquiryUnreadCount()
        .then(setUnread)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <Link
      href="/admin/chats"
      onClick={() => {
        nav?.beginNavigation("/admin/chats");
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
        <MessageSquareMore size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>Chats</span>
      {unread > 0 ? (
        <span
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
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
