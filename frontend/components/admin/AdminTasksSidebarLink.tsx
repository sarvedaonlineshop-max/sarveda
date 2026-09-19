"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";

import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

async function fetchTaskUnread(): Promise<number> {
  if (typeof window === "undefined") return 0;
  const token = window.localStorage.getItem("sv_token");
  if (!token) return 0;
  const res = await fetch("/api/complaints/notifications", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { unreadCount?: number };
  return data.unreadCount ?? 0;
}

export function AdminTasksSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/tasks" || activePath.startsWith("/admin/tasks/");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void fetchTaskUnread()
      .then(setUnread)
      .catch(() => setUnread(0));
    const timer = setInterval(() => {
      void fetchTaskUnread()
        .then(setUnread)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <Link
      href="/admin/tasks"
      onClick={() => {
        nav?.beginNavigation("/admin/tasks");
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
        <ListTodo size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>Tasks</span>
      {unread > 0 ? (
        <span
          title="Unread task notifications"
          aria-label={`${unread} unread task notifications`}
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
